// Establish canvas and rendering context
const canvas = document.getElementById('game-canvas')
const ctx = canvas.getContext('2d')

// Define mutable tile size mapping and zoom
let TILE_SIZE = 82
let CAMERA_PITCH = 20
let WALL_HEIGHT = 2.0
let OBS_HEIGHT = 1.5
let ZOOM = 1.4
let ROTATION = 0

// Define camera offset and drag state
let cameraX = 0
let cameraY = 0
let isDragging = false
let dragStartX = 0
let dragStartY = 0

// Define integer-based tile map array representing the level layout
const levelMap = [
    [1, 1, 1, 1, 1, 2, 0, 2],
    [1, 0, 0, 0, 1, 4, 0, 2],
    [1, 0, 0, 0, 3, 2, 0, 4],
    [1, 0, 0, 0, 1, 4, 0, 2],
    [1, 1, 1, 1, 1, 2, 0, 2],
    [1, 1, 1, 1, 1, 4, 0, 4],
    [1, 1, 0, 0, 1, 2, 0, 2],
    [1, 1, 0, 0, 3, 2, 0, 4],
    [1, 1, 0, 0, 1, 4, 0, 2],
    [1, 1, 1, 1, 1, 2, 0, 2]
]

// Calculate map dimensions dynamically from array length
const MAP_ROWS = levelMap.length
const MAP_COLS = levelMap[0].length

// Define grid scaling arrays representing physical tile dimensions
const colWidths = [0.25, 1.0, 1.0, 1.0, 0.25, 0.5, 1.0, 0.5]
const rowDepths = [0.25, 1.0, 1.0, 1.0, 0.25, 0.25, 1.0, 1.0, 1.0, 0.25]

// Helper to calculate accumulated physical positions along the grid
function getAccumulated(coord, sizes) {
    let acc = 0
    const intCoord = Math.floor(coord)
    for (let i = 0; i < intCoord; i++) {
        acc += sizes[i] || 1.0
    }
    acc += (coord - intCoord) * (sizes[intCoord] || 1.0)
    return acc
}

// Map tile integer IDs to specific hex colors
const tileColors = {
    0: '#666677', // Floor
    1: '#444455', // Wall
    2: '#554444', // Hall side
    3: '#666677', // Doorway
    4: '#885544', // Shelf
    5: '#444455'  // Combined Wall
}

// Map tile integer IDs to specific elevation values
const tileHeights = {
    0: 0,   // Floor
    1: WALL_HEIGHT,   // Wall
    2: 0,   // Hall side
    3: 0,   // Doorway
    4: OBS_HEIGHT, // Shelf
    5: WALL_HEIGHT    // Combined Wall
}

// Map tile integer IDs to boolean collision states
const tileCollisions = {
    0: false,
    1: true,
    2: true,
    3: false,
    4: true,
    5: true
}

// Define character starting position, speed, and facing direction
const player = {
    x: 6.5,
    y: 8.5,
    color: '#ff0044',
    speed: 0.08,
    facing: 'down' // Tracks 'up', 'down', 'left', 'right'
}

// Track active key states for movement
const keys = {
    w: false, a: false, s: false, d: false,
    ArrowUp: false, ArrowDown: false, ArrowLeft: false, ArrowRight: false
}

// Update key state on keydown
window.addEventListener('keydown', (e) => {
    if (keys.hasOwnProperty(e.key)) {
        keys[e.key] = true
        if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
            e.preventDefault()
        }
    }
})

// State variables for interactive tile editing
let selectedGroups = []
let hoveredGroup = null
let isHoverError = false
let isDraggingTile = false
const obstacleMemory = {} // Remembers the original floor tile ID underneath moved obstacles

// Helper to group contiguous obstacle tiles (ID 4) logically together
function getObstacleGroup(col, row) {
    const group = []
    const visited = new Set()
    const queue = [{c: col, r: row}]
    
    while (queue.length > 0) {
        const curr = queue.shift()
        const key = `${curr.c},${curr.r}`
        if (visited.has(key)) continue
        visited.add(key)
        
        if (curr.r >= 0 && curr.r < MAP_ROWS && curr.c >= 0 && curr.c < MAP_COLS && levelMap[curr.r][curr.c] === 4) {
            group.push({col: curr.c, row: curr.r, face: 'top'})
            queue.push({c: curr.c - 1, r: curr.r})
            queue.push({c: curr.c + 1, r: curr.r})
            queue.push({c: curr.c, r: curr.r - 1})
            queue.push({c: curr.c, r: curr.r + 1})
        }
    }
    return group
}

// Helper to group adjacent combined wall tiles (ID 5) into a single selectable unit
function getCombinedGroup(col, row, face) {
    const group = []
    const id = levelMap[row][col]
    
    group.push({ col, row, face })
    if (id !== 5) {
        return group
    }
    
    // Scan outward along the specific face axis to find all contiguous combined segments
    if (face === 0 || face === 2) {
        let c = col - 1
        while (c >= 0 && levelMap[row][c] === 5) {
            group.push({ col: c, row, face })
            c--
        }
        c = col + 1
        while (c < MAP_COLS && levelMap[row][c] === 5) {
            group.push({ col: c, row, face })
            c++
        }
    } else if (face === 1 || face === 3) {
        let r = row - 1
        while (r >= 0 && levelMap[r][col] === 5) {
            group.push({ col, row: r, face })
            r--
        }
        r = row + 1
        while (r < MAP_ROWS && levelMap[r][col] === 5) {
            group.push({ col, row: r, face })
            r++
        }
    }
    return group
}

// Evaluate if two individual tile faces are geometrically valid to combine
function isValidCombine(t1, t2) {
    if (!t1 || !t2) return false
    if (t1.face !== t2.face) return false // Blocks perpendicular corner seams

    // Require strict immediate physical adjacency to prevent jumping empty spaces or corners
    if (t1.face === 0 || t1.face === 2) {
        return Math.abs(t1.col - t2.col) === 1 && t1.row === t2.row
    } else if (t1.face === 1 || t1.face === 3) {
        return Math.abs(t1.row - t2.row) === 1 && t1.col === t2.col
    }
    return false
}

// Check if any tiles within two groups can validly connect
function canCombineGroups(g1, g2) {
    for (let t1 of g1) {
        for (let t2 of g2) {
            if (isValidCombine(t1, t2)) return true
        }
    }
    return false
}

// Helper to check if a point is inside a polygon array of {x, y} vertices
function isPointInPoly(pt, poly) {
    let inside = false
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
        let xi = poly[i].x, yi = poly[i].y
        let xj = poly[j].x, yj = poly[j].y
        let intersect = ((yi > pt.y) !== (yj > pt.y)) && (pt.x < (xj - xi) * (pt.y - yi) / (yj - yi) + xi)
        if (intersect) inside = !inside
    }
    return inside
}

// Transform raw mouse coordinates to isometric screen space
function getMousePos(e) {
    const rect = canvas.getBoundingClientRect()
    const rawX = e.clientX - rect.left
    const rawY = e.clientY - rect.top
    return {
        x: (rawX - (canvas.width / 2 + cameraX)) / ZOOM,
        y: (rawY - (canvas.height / 2 + cameraY)) / ZOOM
    }
}

// Evaluate if isometric mouse position intersects a specific tile's 3D geometry
function checkTileHit(col, row, mx, my) {
    const elevation = tileHeights[levelMap[row][col]]
    const accX0 = getAccumulated(col, colWidths)
    const accX1 = getAccumulated(col + 1, colWidths)
    const accY0 = getAccumulated(row, rowDepths)
    const accY1 = getAccumulated(row + 1, rowDepths)

    const p0_top = project(accX0, accY0, elevation)
    const p1_top = project(accX1, accY0, elevation)
    const p2_top = project(accX1, accY1, elevation)
    const p3_top = project(accX0, accY1, elevation)
    
    const pt = { x: mx, y: my }
    const topPoly = [p0_top, p1_top, p2_top, p3_top]
    if (isPointInPoly(pt, topPoly)) return 'top'

    const p0_bot = project(accX0, accY0, 0)
    const p1_bot = project(accX1, accY0, 0)
    const p2_bot = project(accX1, accY1, 0)
    const p3_bot = project(accX0, accY1, 0)

    const tops = [p0_top, p1_top, p2_top, p3_top]
    const bots = [p0_bot, p1_bot, p2_bot, p3_bot]

    // Ensure we only register raycast hits on faces that are visibly drawn
    const neighborElevations = [
        getTileElevation(col, row - 1),
        getTileElevation(col + 1, row),
        getTileElevation(col, row + 1),
        getTileElevation(col - 1, row)
    ]

    for (let i = 0; i < 4; i++) {
        const next = (i + 1) % 4
        const dx = tops[next].x - tops[i].x
        if (elevation > 0 && dx < 0 && elevation > neighborElevations[i]) {
            const sidePoly = [tops[i], tops[next], bots[next], bots[i]]
            if (isPointInPoly(pt, sidePoly)) return i
        }
    }
    return null
}

// Scan map to find the topmost tile under the mouse cursor
function getTileAtMouse(mx, my) {
    let foundTile = null

    // Pass 1: Ground level
    for (let row = 0; row < MAP_ROWS; row++) {
        for (let col = 0; col < MAP_COLS; col++) {
            if (tileHeights[levelMap[row][col]] <= 0) {
                const hit = checkTileHit(col, row, mx, my)
                if (hit !== null) foundTile = { col, row, face: hit }
            }
        }
    }

    // Pass 2: Elevated elements (following topological order to respect depth)
    const safeRot = typeof ROTATION !== 'undefined' ? ROTATION : 0
    let cStart = 0, cEnd = MAP_COLS, cStep = 1
    let rStart = 0, rEnd = MAP_ROWS, rStep = 1

    if (safeRot === 90) {
        rStart = MAP_ROWS - 1; rEnd = -1; rStep = -1
    } else if (safeRot === 180) {
        cStart = MAP_COLS - 1; cEnd = -1; cStep = -1
        rStart = MAP_ROWS - 1; rEnd = -1; rStep = -1
    } else if (safeRot === 270) {
        cStart = MAP_COLS - 1; cEnd = -1; cStep = -1
    }

    for (let row = rStart; row !== rEnd; row += rStep) {
        for (let col = cStart; col !== cEnd; col += cStep) {
            if (tileHeights[levelMap[row][col]] > 0) {
                const hit = checkTileHit(col, row, mx, my)
                if (hit !== null) foundTile = { col, row, face: hit }
            }
        }
    }
    return foundTile
}

// Update key state on keyup
window.addEventListener('keyup', (e) => {
    if (keys.hasOwnProperty(e.key)) {
        keys[e.key] = false
    }
})

// Handle double-click to select or deselect interactive obstacles or valid wall edges
canvas.addEventListener('dblclick', (e) => {
    const pos = getMousePos(e)
    const clicked = getTileAtMouse(pos.x, pos.y)
    
    if (clicked) {
        const id = levelMap[clicked.row][clicked.col]
        const selIndex = selectedGroups.findIndex(g => g.some(t => t.col === clicked.col && t.row === clicked.row && (id === 4 || t.face === clicked.face)))

        if (id === 4) {
            const group = getObstacleGroup(clicked.col, clicked.row)
            if (selIndex > -1) {
                selectedGroups.splice(selIndex, 1)
            } else {
                selectedGroups = [group]
            }
        } else if ((id === 1 || id === 5) && clicked.face !== 'top') {
            const group = getCombinedGroup(clicked.col, clicked.row, clicked.face)
            
            if (selIndex > -1) {
                selectedGroups.splice(selIndex, 1)
            } else {
                if (selectedGroups.length > 0 && levelMap[selectedGroups[0][0].row][selectedGroups[0][0].col] === 4) {
                    selectedGroups = []
                }
                
                // Start fresh if two are already selected, or if the new click is geometrically invalid
                if (selectedGroups.length >= 2) {
                    selectedGroups = [group]
                } else if (selectedGroups.length === 1 && !canCombineGroups(selectedGroups[0], group)) {
                    selectedGroups = [group]
                } else {
                    selectedGroups.push(group)
                }
            }
        } else {
            selectedGroups = []
        }
    } else {
        selectedGroups = []
    }
    
    const btnCombine = document.getElementById('btn-combine')
    if (selectedGroups.length === 2) {
        btnCombine.style.display = 'block'
    } else {
        btnCombine.style.display = 'none'
    }

    // Manually trigger a mousemove event to immediately update cursor and hover states
    window.dispatchEvent(new MouseEvent('mousemove', { clientX: e.clientX, clientY: e.clientY }))
})

// Process multi-group wall combining interaction
document.getElementById('btn-combine').addEventListener('click', () => {
    if (selectedGroups.length === 2) {
        selectedGroups[0].forEach(t => levelMap[t.row][t.col] = 5)
        selectedGroups[1].forEach(t => levelMap[t.row][t.col] = 5)
        selectedGroups = []
        document.getElementById('btn-combine').style.display = 'none'
    }
})

// Handle canvas mouse events for tile dragging and camera panning
canvas.addEventListener('mousedown', (e) => {
    const pos = getMousePos(e)
    const clicked = getTileAtMouse(pos.x, pos.y)

    // Check if the user is clicking anywhere on a currently selected shelf tile footprint
    if (clicked && selectedGroups.length === 1 && levelMap[clicked.row][clicked.col] === 4 && selectedGroups[0].some(t => t.col === clicked.col && t.row === clicked.row)) {
        isDraggingTile = true
        canvas.style.cursor = 'move'
    } else {
        isDragging = true
        dragStartX = e.clientX - cameraX
        dragStartY = e.clientY - cameraY
        canvas.style.cursor = 'grabbing'
    }
})

window.addEventListener('mousemove', (e) => {
    const pos = getMousePos(e)
    const hovered = getTileAtMouse(pos.x, pos.y)
    
    let currentCursor = 'default'

    if (isDraggingTile && selectedGroups.length === 1) {
        currentCursor = 'move'
        const selTiles = selectedGroups[0]
        
        // Validate if hovered is a valid floor drop target and isn't just the identical footprint
        if (hovered && (hovered.col !== selTiles[0].col || hovered.row !== selTiles[0].row)) {
            
            // Helper to check for a combined wall group adjacent to hovered space
            const checkWallGroup = (wc, wr) => {
                if (wr >= 0 && wr < MAP_ROWS && wc >= 0 && wc < MAP_COLS && levelMap[wr][wc] === 5) {
                    let group = [{col: wc, row: wr}]
                    let c = wc - 1; while (c >= 0 && levelMap[wr][c] === 5) { group.push({col: c, row: wr}); c--; }
                    c = wc + 1; while (c < MAP_COLS && levelMap[wr][c] === 5) { group.push({col: c, row: wr}); c++; }
                    if (group.length > 1) return group
                    
                    group = [{col: wc, row: wr}]
                    let r = wr - 1; while (r >= 0 && levelMap[r][wc] === 5) { group.push({col: wc, row: r}); r--; }
                    r = wr + 1; while (r < MAP_ROWS && levelMap[r][wc] === 5) { group.push({col: wc, row: r}); r++; }
                    if (group.length > 1) return group
                }
                return null
            }

            // Determine intended footprint dynamically snapping to wall width
            let newFootprint = [{col: hovered.col, row: hovered.row, face: 'top'}]
            
            let wallGroup = checkWallGroup(hovered.col, hovered.row - 1); let ox = 0, oy = 1;
            if (!wallGroup) { wallGroup = checkWallGroup(hovered.col, hovered.row + 1); ox = 0; oy = -1; }
            if (!wallGroup) { wallGroup = checkWallGroup(hovered.col - 1, hovered.row); ox = 1; oy = 0; }
            if (!wallGroup) { wallGroup = checkWallGroup(hovered.col + 1, hovered.row); ox = -1; oy = 0; }

            if (wallGroup) {
                newFootprint = wallGroup.map(w => ({col: w.col + ox, row: w.row + oy, face: 'top'}))
            }

            // Validate the footprint safely avoiding player and solid walls
            let isValid = true
            for (let pt of newFootprint) {
                if (pt.col < 0 || pt.col >= MAP_COLS || pt.row < 0 || pt.row >= MAP_ROWS) { isValid = false; break; }
                const tid = levelMap[pt.row][pt.col]
                const isSelf = selTiles.some(st => st.col === pt.col && st.row === pt.row)
                if (tid !== 0 && tid !== 2 && !isSelf) { isValid = false; break; }
                if (pt.col === Math.floor(player.x) && pt.row === Math.floor(player.y)) { isValid = false; break; }
            }

            // Fall back to 1x1 drop if the dynamic wall snap is invalid
            if (!isValid && wallGroup) {
                newFootprint = [{col: hovered.col, row: hovered.row, face: 'top'}]
                isValid = true
                const pt = newFootprint[0]
                if (pt.col < 0 || pt.col >= MAP_COLS || pt.row < 0 || pt.row >= MAP_ROWS) { isValid = false; }
                else {
                    const tid = levelMap[pt.row][pt.col]
                    const isSelf = selTiles.some(st => st.col === pt.col && st.row === pt.row)
                    if (tid !== 0 && tid !== 2 && !isSelf) { isValid = false; }
                    if (pt.col === Math.floor(player.x) && pt.row === Math.floor(player.y)) { isValid = false; }
                }
            }

            const isSame = newFootprint.length === selTiles.length && newFootprint.every(nt => selTiles.some(st => st.col === nt.col && st.row === nt.row))

            if (isValid && !isSame) {
                const newMemory = {}
                // Cache the floor tiles being overwritten
                for (let pt of newFootprint) {
                    const key = `${pt.col},${pt.row}`
                    if (selTiles.some(st => st.col === pt.col && st.row === pt.row)) {
                        newMemory[key] = obstacleMemory[key] !== undefined ? obstacleMemory[key] : (colWidths[pt.col] < 1 || rowDepths[pt.row] < 1 ? 2 : 0)
                    } else {
                        newMemory[key] = levelMap[pt.row][pt.col]
                    }
                }

                // Restore the old floor tiles not contained in the new footprint
                for (let st of selTiles) {
                    if (!newFootprint.some(nt => nt.col === st.col && nt.row === st.row)) {
                        const key = `${st.col},${st.row}`
                        const defaultFloorId = (colWidths[st.col] < 1 || rowDepths[st.row] < 1) ? 2 : 0
                        levelMap[st.row][st.col] = obstacleMemory[key] !== undefined ? obstacleMemory[key] : defaultFloorId
                        delete obstacleMemory[key]
                    }
                }

                // Commit the new obstacle footprint
                for (let pt of newFootprint) {
                    levelMap[pt.row][pt.col] = 4
                }

                for (let key in newMemory) {
                    obstacleMemory[key] = newMemory[key]
                }

                selectedGroups[0] = newFootprint
            }
        }
    } else if (isDragging) {
        currentCursor = 'grabbing'
        cameraX = e.clientX - dragStartX
        cameraY = e.clientY - dragStartY
    } else {
        // Track hovered groups and evaluate validation rules dynamically
        if (hovered) {
            const id = levelMap[hovered.row][hovered.col]
            if (id === 4) {
                hoveredGroup = getObstacleGroup(hovered.col, hovered.row)
                
                // Flag error if hovering an obstacle while any number of walls are selected
                if (selectedGroups.length > 0) {
                    const selId = levelMap[selectedGroups[0][0].row][selectedGroups[0][0].col]
                    if (selId === 1 || selId === 5) {
                        isHoverError = true
                    } else {
                        isHoverError = false
                        if (selId === 4 && selectedGroups[0].some(t => t.col === hovered.col && t.row === hovered.row)) {
                            currentCursor = 'move'
                        } else {
                            currentCursor = 'pointer'
                        }
                    }
                } else {
                    isHoverError = false
                    currentCursor = 'pointer'
                }
            } else if ((id === 1 || id === 5) && hovered.face !== 'top') {
                hoveredGroup = getCombinedGroup(hovered.col, hovered.row, hovered.face)
                
                // Cross-check valid connections if an item is already selected
                if (selectedGroups.length === 1) {
                    const selId = levelMap[selectedGroups[0][0].row][selectedGroups[0][0].col]
                    if (selId === 1 || selId === 5) {
                        const isAlreadySelected = selectedGroups[0].some(t => t.col === hovered.col && t.row === hovered.row && t.face === hovered.face)
                        if (!isAlreadySelected && !canCombineGroups(selectedGroups[0], hoveredGroup)) {
                            isHoverError = true
                        } else {
                            isHoverError = false
                            currentCursor = 'pointer'
                        }
                    } else if (selId === 4) {
                        // Flag error if hovering a wall while a shelf is selected
                        isHoverError = true
                    } else {
                        isHoverError = false
                        currentCursor = 'pointer'
                    }
                } else if (selectedGroups.length === 2) {
                    // Flag error if hovering a third wall when two are already selected
                    const isAlreadySelected = selectedGroups.some(g => g.some(t => t.col === hovered.col && t.row === hovered.row && t.face === hovered.face))
                    if (!isAlreadySelected) {
                        isHoverError = true
                    } else {
                        isHoverError = false
                        currentCursor = 'pointer'
                    }
                } else {
                    isHoverError = false
                    currentCursor = 'pointer'
                }
            } else {
                hoveredGroup = null
                isHoverError = false
            }
        } else {
            hoveredGroup = null
            isHoverError = false
        }
    }
    
    canvas.style.cursor = currentCursor
})

window.addEventListener('mouseup', () => {
    isDragging = false
    isDraggingTile = false
    canvas.style.cursor = 'default'
})

// Map physical coordinates through cardinal rotation matrix to Isometric screen space
function project(accX, accY, elevation) {
    const centerW = colWidths.reduce((a, b) => a + b, 0) / 2
    const centerH = rowDepths.reduce((a, b) => a + b, 0) / 2
    
    const cx = accX - centerW
    const cy = accY - centerH
    
    // Failsafe safely defaults to 0 if the ROTATION variable declaration was missed
    const safeRot = typeof ROTATION !== 'undefined' ? ROTATION : 0
    const rad = safeRot * Math.PI / 180
    const cos = Math.round(Math.cos(rad))
    const sin = Math.round(Math.sin(rad))
    
    const rotX = cx * cos - cy * sin
    const rotY = cx * sin + cy * cos
    
    const safePitch = typeof CAMERA_PITCH !== 'undefined' ? CAMERA_PITCH : 20
    const pitchRad = safePitch * Math.PI / 180
    const tileWidth = TILE_SIZE
    const tileHeight = TILE_SIZE * Math.sin(pitchRad)
    
    // Disconnect elevation height multiplier from camera pitch projection
    const zHeight = TILE_SIZE
    
    let isoX, isoY
    
    if (safePitch > 40) {
        // Render directly top-down 2D map view without isometric diamond distortion
        isoX = rotX * TILE_SIZE
        isoY = rotY * TILE_SIZE
    } else if (safePitch === 0) {
        // Render 2D side-scroller view flattening depth purely to the Z-buffer
        isoX = rotX * TILE_SIZE
        isoY = -(elevation * zHeight)
    } else {
        // By omitting the center offset here, we perfectly anchor the level center to 0,0
        isoX = (rotX - rotY) * (tileWidth / 2)
        isoY = (rotX + rotY) * (tileHeight / 2) - (elevation * (zHeight / 2))
    }
    
    // Remove artificial elevation bias from topological depth sorting
    return { 
        x: isoX, 
        y: isoY, 
        depth: rotX + rotY 
    }
}

// Helper to fetch logical tile elevation safely
function getTileElevation(col, row) {
    if (row < 0 || row >= MAP_ROWS || col < 0 || col >= MAP_COLS) return -1
    const tileId = levelMap[row][col]
    return tileHeights[tileId]
}

// Draw individual isometric polygon block dynamically culling hidden 3D faces
function drawTile(col, row, color, elevation) {
    const id = levelMap[row][col]

    const accX0 = getAccumulated(col, colWidths)
    const accX1 = getAccumulated(col + 1, colWidths)
    const accY0 = getAccumulated(row, rowDepths)
    const accY1 = getAccumulated(row + 1, rowDepths)

    const p0_top = project(accX0, accY0, elevation)
    const p1_top = project(accX1, accY0, elevation)
    const p2_top = project(accX1, accY1, elevation)
    const p3_top = project(accX0, accY1, elevation)

    const p0_bot = project(accX0, accY0, 0)
    const p1_bot = project(accX1, accY0, 0)
    const p2_bot = project(accX1, accY1, 0)
    const p3_bot = project(accX0, accY1, 0)

    const tops = [p0_top, p1_top, p2_top, p3_top]
    const bots = [p0_bot, p1_bot, p2_bot, p3_bot]

    // Track elevations of directly adjacent tiles
    const neighborElevations = [
        getTileElevation(col, row - 1),
        getTileElevation(col + 1, row),
        getTileElevation(col, row + 1),
        getTileElevation(col - 1, row)
    ]

    // Apply transparency if this elevated tile occludes the player
    if (elevation > 0) {
        const pAccX = getAccumulated(player.x, colWidths)
        const pAccY = getAccumulated(player.y, rowDepths)
        const pProj = project(pAccX, pAccY, 0)
        
        const tAccX = getAccumulated(col + 0.5, colWidths)
        const tAccY = getAccumulated(row + 0.5, rowDepths)
        const tProj = project(tAccX, tAccY, 0)
        
        if (tProj.depth > pProj.depth) {
            const minX = Math.min(tops[0].x, tops[1].x, tops[2].x, tops[3].x, bots[0].x, bots[1].x, bots[2].x, bots[3].x)
            const maxX = Math.max(tops[0].x, tops[1].x, tops[2].x, tops[3].x, bots[0].x, bots[1].x, bots[2].x, bots[3].x)
            const minY = Math.min(tops[0].y, tops[1].y, tops[2].y, tops[3].y, bots[0].y, bots[1].y, bots[2].y, bots[3].y)
            const maxY = Math.max(tops[0].y, tops[1].y, tops[2].y, tops[3].y, bots[0].y, bots[1].y, bots[2].y, bots[3].y)
            
            // Check if player bounding box visually overlaps the tile bounding box
            if (pProj.x + 6 > minX && pProj.x - 6 < maxX && pProj.y > minY && pProj.y - 34 < maxY) {
                ctx.globalAlpha = 0.4
            }
        }
    }

    // Draw side faces dynamically checking camera angle visibility and adjacent connections
    for (let i = 0; i < 4; i++) {
        const next = (i + 1) % 4
        const dx = tops[next].x - tops[i].x
        
        // Only draw the vertical face if it faces the camera AND the adjacent tile is lower
        if (elevation > 0 && dx < 0 && elevation > neighborElevations[i]) {
            const isFaceSelected = selectedGroups.some(g => g.some(t => t.col === col && t.row === row && (t.face === i || id === 4)))
            const isFaceHovered = (hoveredGroup && hoveredGroup.some(t => t.col === col && t.row === row && (t.face === i || id === 4)))

            let strokeColor = '#222'
            let strokeWidth = 1
            if (isFaceSelected) {
                strokeColor = '#ffcc00'
                strokeWidth = 2
            } else if (isFaceHovered) {
                strokeColor = isHoverError ? '#ff0000' : '#ffffff'
                strokeWidth = 2
            }

            ctx.beginPath()
            ctx.moveTo(tops[i].x, tops[i].y)
            ctx.lineTo(tops[next].x, tops[next].y)
            ctx.lineTo(bots[next].x, bots[next].y)
            ctx.lineTo(bots[i].x, bots[i].y)
            ctx.closePath()
            
            ctx.fillStyle = color
            ctx.fill()
            
            // Shade the visible vertical faces uniquely
            const dy = tops[next].y - tops[i].y
            ctx.fillStyle = dy < 0 ? 'rgba(0,0,0,0.4)' : 'rgba(0,0,0,0.2)'
            ctx.fill()
            
            // Overlay yellow highlight tint if selected
            if (isFaceSelected) {
                ctx.fillStyle = 'rgba(255, 255, 0, 0.3)'
                ctx.fill()
            }
            
            // Stroke the vertical face boundary unless it is a combined wall tile
            // Hovered and Selected states will still force the stroke for visual UI feedback
            if (id !== 5 || isFaceSelected || isFaceHovered) {
                ctx.strokeStyle = strokeColor
                ctx.lineWidth = strokeWidth
                ctx.lineJoin = 'round'
                ctx.lineCap = 'round'
                ctx.stroke()
            }
            ctx.lineWidth = 1 // Reset for other strokes
        }
    }

    // Check top face interaction states
    const isTopSelected = selectedGroups.some(g => g.some(t => t.col === col && t.row === row && (t.face === 'top' || id === 4)))
    const isTopHovered = (hoveredGroup && hoveredGroup.some(t => t.col === col && t.row === row && (t.face === 'top' || id === 4)))

    let topStrokeColor = '#222'
    let topStrokeWidth = 1
    if (isTopSelected) {
        topStrokeColor = '#ffcc00'
        topStrokeWidth = 2
    } else if (isTopHovered) {
        topStrokeColor = isHoverError ? '#ff0000' : '#ffffff'
        topStrokeWidth = 2
    }

    // Draw top face fill
    ctx.beginPath()
    ctx.moveTo(p0_top.x, p0_top.y)
    ctx.lineTo(p1_top.x, p1_top.y)
    ctx.lineTo(p2_top.x, p2_top.y)
    ctx.lineTo(p3_top.x, p3_top.y)
    ctx.closePath()
    ctx.fillStyle = color
    ctx.fill()
    
    // Overlay yellow highlight tint if selected
    if (isTopSelected) {
        ctx.fillStyle = 'rgba(255, 255, 0, 0.4)'
        ctx.fill()
    }
    
    // Stroke only outer exposed edges to visually merge connected structures
    ctx.beginPath()
    for (let i = 0; i < 4; i++) {
        const next = (i + 1) % 4
        if (elevation !== neighborElevations[i]) {
            ctx.moveTo(tops[i].x, tops[i].y)
            ctx.lineTo(tops[next].x, tops[next].y)
        }
    }
    ctx.strokeStyle = topStrokeColor
    ctx.lineWidth = topStrokeWidth
    ctx.lineJoin = 'round'
    ctx.lineCap = 'round'
    ctx.stroke()
    ctx.lineWidth = 1 // Reset for other strokes
    ctx.globalAlpha = 1.0 // Restore transparency state
}

// Render line of sight cone on the floor plane
function drawCone() {
    const pAccX = getAccumulated(player.x, colWidths)
    const pAccY = getAccumulated(player.y, rowDepths)
    const groundPos = project(pAccX, pAccY, 0)

    // Calculate logical grid facing direction
    let sx = 0
    let sy = 0
    if (player.facing === 'up') sy = -1
    if (player.facing === 'down') sy = 1
    if (player.facing === 'left') sx = -1
    if (player.facing === 'right') sx = 1

    const safeRot = typeof ROTATION !== 'undefined' ? ROTATION : 0
    const rad = -safeRot * Math.PI / 180
    const cos = Math.round(Math.cos(rad))
    const sin = Math.round(Math.sin(rad))

    const gx = sx * cos - sy * sin
    const gy = sx * sin + sy * cos

    // Calculate cone projection points directly in physical accumulated space for perfect symmetry
    const coneDist = 3.0
    const coneSpread = 2.5

    const endAccX = pAccX + gx * coneDist
    const endAccY = pAccY + gy * coneDist
    const perpAccX = -gy * coneSpread
    const perpAccY = gx * coneSpread

    const accLeftX = endAccX + perpAccX
    const accLeftY = endAccY + perpAccY
    const accRightX = endAccX - perpAccX
    const accRightY = endAccY - perpAccY

    const pLeft = project(accLeftX, accLeftY, 0)
    const pRight = project(accRightX, accRightY, 0)

    // Render semi transparent line of sight cone onto floor plane
    ctx.fillStyle = 'rgba(255, 255, 0, 0.25)'
    ctx.beginPath()
    ctx.moveTo(groundPos.x, groundPos.y)
    ctx.lineTo(pLeft.x, pLeft.y)
    ctx.lineTo(pRight.x, pRight.y)
    ctx.closePath()
    ctx.fill()
}

// Draw player character mapped to isometric grid
function drawPlayer() {
    const tileX = Math.floor(player.x)
    const tileY = Math.floor(player.y)
    const tileId = levelMap[tileY][tileX]
    const elevation = tileHeights[tileId]

    const pAccX = getAccumulated(player.x, colWidths)
    const pAccY = getAccumulated(player.y, rowDepths)
    const pos = project(pAccX, pAccY, elevation)

    if (typeof CAMERA_PITCH !== 'undefined' && CAMERA_PITCH > 40) {
        // Draw top-down square representation
        ctx.fillStyle = player.color
        ctx.fillRect(pos.x - 6, pos.y - 6, 12, 12)
        ctx.strokeStyle = '#222'
        ctx.strokeRect(pos.x - 6, pos.y - 6, 12, 12)
        
        // Draw directional visor for top-down view
        ctx.fillStyle = '#111'
        if (player.facing === 'down') {
            ctx.fillRect(pos.x - 4, pos.y + 2, 8, 4)
        } else if (player.facing === 'up') {
            ctx.fillRect(pos.x - 4, pos.y - 6, 8, 4)
        } else if (player.facing === 'left') {
            ctx.fillRect(pos.x - 6, pos.y - 4, 4, 8)
        } else if (player.facing === 'right') {
            ctx.fillRect(pos.x + 2, pos.y - 4, 4, 8)
        }
    } else {
        // Draw slimmer character body to prevent visual bleed over 2.5D grid lines
        ctx.fillStyle = player.color
        ctx.fillRect(pos.x - 6, pos.y - 34, 12, 34)
        ctx.strokeStyle = '#222'
        ctx.strokeRect(pos.x - 6, pos.y - 34, 12, 34)

        // Draw directional visor to indicate logical facing direction
        ctx.fillStyle = '#111'
        if (player.facing === 'down') {
            ctx.fillRect(pos.x - 4, pos.y - 30, 8, 6)
        } else if (player.facing === 'left') {
            ctx.fillRect(pos.x - 6, pos.y - 30, 6, 6)
        } else if (player.facing === 'right') {
            ctx.fillRect(pos.x, pos.y - 30, 6, 6)
        }
    }
}

// Determine if a specific logical grid coordinate is walkable
function isWalkable(x, y) {
    const col = Math.floor(x)
    const row = Math.floor(y)
    if (row < 0 || row >= MAP_ROWS || col < 0 || col >= MAP_COLS) return false
    const tileId = levelMap[row][col]
    return !tileCollisions[tileId]
}

// Evaluate dynamic collision bounding box to allow close proximity to obstacles while preserving corner anti-clipping
function checkCollision(x, y) {
    const wallR = 0.2  // Padded boundary to prevent z fighting at tall structural wall corners
    const obsR = 0.05  // Tight boundary to allow getting physically closer to obstacles and doorways

    const points = [
        {dx: -1, dy: -1}, {dx: 1, dy: -1},
        {dx: -1, dy: 1}, {dx: 1, dy: 1}
    ]

    for (let p of points) {
        // Evaluate padded boundary against structural walls excluding doorway sides
        let col = Math.floor(x + p.dx * wallR)
        let row = Math.floor(y + p.dy * wallR)
        if (row < 0 || row >= MAP_ROWS || col < 0 || col >= MAP_COLS) return false
        let id = levelMap[row][col]
        
        if (tileCollisions[id] && id !== 4 && id !== 2) {
            let isDoorwayWall = false
            if (id === 1 || id === 5) {
                if ((row > 0 && levelMap[row - 1][col] === 3) ||
                    (row < MAP_ROWS - 1 && levelMap[row + 1][col] === 3) ||
                    (col > 0 && levelMap[row][col - 1] === 3) ||
                    (col < MAP_COLS - 1 && levelMap[row][col + 1] === 3)) {
                    isDoorwayWall = true
                }
            }
            if (!isDoorwayWall) return false
        }

        // Evaluate tight boundary against obstacles and doorway sides
        col = Math.floor(x + p.dx * obsR)
        row = Math.floor(y + p.dy * obsR)
        if (row < 0 || row >= MAP_ROWS || col < 0 || col >= MAP_COLS) return false
        id = levelMap[row][col]
        
        if (tileCollisions[id]) {
            let isDoorwayFloor = false
            if (id === 2) {
                if ((row > 0 && levelMap[row - 1][col] === 3) ||
                    (row < MAP_ROWS - 1 && levelMap[row + 1][col] === 3) ||
                    (col > 0 && levelMap[row][col - 1] === 3) ||
                    (col < MAP_COLS - 1 && levelMap[row][col + 1] === 3)) {
                    isDoorwayFloor = true
                }
            }
            if (!isDoorwayFloor) return false
        }
    }
    
    return true
}

// Modify player coordinates based on active keys and padded collision boundaries
function update() {
    let inputX = 0
    let inputY = 0

    // Capture logical screen-relative input direction
    if (keys.w || keys.ArrowUp) { inputY -= 1; player.facing = 'up' }
    if (keys.s || keys.ArrowDown) { inputY += 1; player.facing = 'down' }
    if (keys.a || keys.ArrowLeft) { inputX -= 1; player.facing = 'left' }
    if (keys.d || keys.ArrowRight) { inputX += 1; player.facing = 'right' }

    if (inputX !== 0 || inputY !== 0) {
        // Normalize input vector to maintain constant diagonal speed
        const length = Math.sqrt(inputX * inputX + inputY * inputY)
        const normX = inputX / length
        const normY = inputY / length

        // Inverse rotate the input vector to map visual screen direction to the rotated grid
        const safeRot = typeof ROTATION !== 'undefined' ? ROTATION : 0
        const rad = -safeRot * Math.PI / 180
        const cos = Math.round(Math.cos(rad))
        const sin = Math.round(Math.sin(rad))

        const gridDirX = normX * cos - normY * sin
        const gridDirY = normX * sin + normY * cos

        // Scale logical movement speed to match physical tile dimensions
        const scaleX = colWidths[Math.floor(player.x)] || 1.0
        const scaleY = rowDepths[Math.floor(player.y)] || 1.0

        let nextX = player.x + (player.speed / scaleX) * gridDirX
        let nextY = player.y + (player.speed / scaleY) * gridDirY

        // Apply independent axis collision evaluating padded bounding box
        if (checkCollision(nextX, player.y)) {
            player.x = nextX
        }
        if (checkCollision(player.x, nextY)) {
            player.y = nextY
        }

        player.x = Math.max(0, Math.min(MAP_COLS - 0.01, player.x))
        player.y = Math.max(0, Math.min(MAP_ROWS - 0.01, player.y))
    }
}

// Clear canvas and render frame using rigorous topological grid sorting
function loop() {
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    update()

    ctx.save()
    ctx.translate(canvas.width / 2 + cameraX, canvas.height / 2 + cameraY)
    ctx.scale(ZOOM, ZOOM)

    // Pass 1: Render all ground/floor tiles (elevation <= 0) first
    for (let row = 0; row < MAP_ROWS; row++) {
        for (let col = 0; col < MAP_COLS; col++) {
            const tileId = levelMap[row][col]
            const elevation = tileHeights[tileId]
            if (elevation <= 0) {
                drawTile(col, row, tileColors[tileId], elevation)
            }
        }
    }

    // Determine topological drawing direction based on camera rotation
    const safeRot = typeof ROTATION !== 'undefined' ? ROTATION : 0
    let cStart = 0, cEnd = MAP_COLS, cStep = 1
    let rStart = 0, rEnd = MAP_ROWS, rStep = 1

    if (safeRot === 90) {
        rStart = MAP_ROWS - 1; rEnd = -1; rStep = -1
    } else if (safeRot === 180) {
        cStart = MAP_COLS - 1; cEnd = -1; cStep = -1
        rStart = MAP_ROWS - 1; rEnd = -1; rStep = -1
    } else if (safeRot === 270) {
        cStart = MAP_COLS - 1; cEnd = -1; cStep = -1
    }

    // Pass 2: Render elevated blocks and player topologically back-to-front
    for (let row = rStart; row !== rEnd; row += rStep) {
        for (let col = cStart; col !== cEnd; col += cStep) {
            const tileId = levelMap[row][col]
            const elevation = tileHeights[tileId]
            
            if (elevation > 0) {
                drawTile(col, row, tileColors[tileId], elevation)
            }
            
            // Render player exactly when the loop processes the cell the player stands in
            if (Math.floor(player.x) === col && Math.floor(player.y) === row) {
                drawPlayer()
            }
        }
    }

    // Pass 3: Render line of sight cone last so it visibly overlays both floor and elevated structures
    drawCone()

    ctx.restore()
    requestAnimationFrame(loop)
}

// Execute game loop
loop()
