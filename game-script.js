// Establish canvas and rendering context
const canvas = document.getElementById('game-canvas')
const ctx = canvas.getContext('2d')

// Define mutable tile size mapping and zoom
let TILE_WIDTH = 82
let TILE_HEIGHT = 27
let ZOOM = 1.4
let ROTATION = 0

// Define camera offset and drag state
let cameraX = 0
let cameraY = 0
let isDragging = false
let dragStartX = 0
let dragStartY = 0

// Cache UI elements
const widthSlider = document.getElementById('tile-width')
const heightSlider = document.getElementById('tile-height')
const zoomSlider = document.getElementById('zoom')
const rotSlider = document.getElementById('rotation')
const widthVal = document.getElementById('width-val')
const heightVal = document.getElementById('height-val')
const zoomVal = document.getElementById('zoom-val')
const rotVal = document.getElementById('rot-val')
const exportOut = document.getElementById('export-out')

// Store history for undo functionality
const historyStack = []

// Push current state to history stack
function saveState() {
    historyStack.push({ w: TILE_WIDTH, h: TILE_HEIGHT, z: ZOOM, r: ROTATION })
    if (historyStack.length > 100) historyStack.shift()
}

// Bind save state events to slider interactions
function attachSave(element) {
    element.addEventListener('mousedown', saveState)
    element.addEventListener('touchstart', saveState)
}
attachSave(widthSlider)
attachSave(heightSlider)
attachSave(zoomSlider)
attachSave(rotSlider)

// Helper logic to step sliders programmatically with UI buttons
function attachStepper(inputId, btnDownId, btnUpId, stepValue) {
    const input = document.getElementById(inputId)
    document.getElementById(btnDownId).addEventListener('click', () => {
        saveState()
        input.value = Math.max(parseFloat(input.min), parseFloat(input.value) - stepValue)
        input.dispatchEvent(new Event('input'))
    })
    document.getElementById(btnUpId).addEventListener('click', () => {
        saveState()
        input.value = Math.min(parseFloat(input.max), parseFloat(input.value) + stepValue)
        input.dispatchEvent(new Event('input'))
    })
}

// Bind custom step increments to interface arrows (5 units for size, dynamic for rest)
attachStepper('tile-width', 'btn-tw-down', 'btn-tw-up', 5)
attachStepper('tile-height', 'btn-th-down', 'btn-th-up', 5)
attachStepper('zoom', 'btn-z-down', 'btn-z-up', 0.1)
attachStepper('rotation', 'btn-r-down', 'btn-r-up', 90)

// Update values visually during drag and button steps
widthSlider.addEventListener('input', (e) => {
    TILE_WIDTH = parseInt(e.target.value)
    widthVal.innerText = TILE_WIDTH
})
heightSlider.addEventListener('input', (e) => {
    TILE_HEIGHT = parseInt(e.target.value)
    heightVal.innerText = TILE_HEIGHT
})
zoomSlider.addEventListener('input', (e) => {
    ZOOM = parseFloat(e.target.value)
    zoomVal.innerText = ZOOM.toFixed(1)
})
rotSlider.addEventListener('input', (e) => {
    ROTATION = parseInt(e.target.value)
    rotVal.innerText = ROTATION
})

// Revert to last saved state
document.getElementById('btn-undo').addEventListener('click', () => {
    if (historyStack.length > 0) {
        const lastState = historyStack.pop()
        TILE_WIDTH = lastState.w
        TILE_HEIGHT = lastState.h
        ZOOM = lastState.z
        ROTATION = lastState.r
        
        widthSlider.value = TILE_WIDTH
        heightSlider.value = TILE_HEIGHT
        zoomSlider.value = ZOOM
        rotSlider.value = ROTATION
        
        widthVal.innerText = TILE_WIDTH
        heightVal.innerText = TILE_HEIGHT
        zoomVal.innerText = ZOOM.toFixed(1)
        rotVal.innerText = ROTATION
    }
})

// Export updated script variables
document.getElementById('btn-export').addEventListener('click', () => {
    exportOut.style.display = 'block'
    exportOut.value = `let TILE_WIDTH = ${TILE_WIDTH}\nlet TILE_HEIGHT = ${TILE_HEIGHT}\nlet ZOOM = ${ZOOM}\nlet ROTATION = ${ROTATION}\nlet cameraX = ${cameraX}\nlet cameraY = ${cameraY}`
})

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
    3: '#776655', // Doorway
    4: '#885544', // Shelf
    5: '#444455'  // Combined Wall
}

// Map tile integer IDs to specific elevation values
const tileHeights = {
    0: 0,   // Floor
    1: 2,   // Wall
    2: 0,   // Hall side
    3: 0,   // Doorway
    4: 1.5, // Shelf
    5: 2    // Combined Wall
}

// Map tile integer IDs to boolean collision states
const tileCollisions = {
    0: false,
    1: true,
    2: false,
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
            if (selIndex > -1) {
                selectedGroups.splice(selIndex, 1)
            } else {
                selectedGroups = [[clicked]]
            }
        } else if ((id === 1 || id === 5) && clicked.face !== 'top') {
            const group = getCombinedGroup(clicked.col, clicked.row, clicked.face)
            
            if (selIndex > -1) {
                selectedGroups.splice(selIndex, 1)
            } else {
                if (selectedGroups.length > 0 && levelMap[selectedGroups[0][0].row][selectedGroups[0][0].col] === 4) {
                    selectedGroups = []
                }
                
                // If a wall is already selected but the new click is geometrically invalid, drop the old selection
                if (selectedGroups.length === 1 && !canCombineGroups(selectedGroups[0], group)) {
                    selectedGroups = [group]
                } else {
                    selectedGroups.push(group)
                    if (selectedGroups.length > 2) {
                        selectedGroups.shift()
                    }
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

    // Check if the user is clicking exactly on a currently selected shelf tile
    if (clicked && selectedGroups.length === 1 && selectedGroups[0][0].col === clicked.col && selectedGroups[0][0].row === clicked.row && levelMap[clicked.row][clicked.col] === 4) {
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
        const selTile = selectedGroups[0][0]
        if (hovered && (hovered.col !== selTile.col || hovered.row !== selTile.row)) {
            // Block obstacle relocation if hovered coordinate matches the player coordinate
            const isPlayerTile = (hovered.col === Math.floor(player.x) && hovered.row === Math.floor(player.y))
            if (!isPlayerTile) {
                const targetId = levelMap[hovered.row][hovered.col]
                if (targetId === 2 || targetId === 0) {
                    const oldKey = `${selTile.col},${selTile.row}`
                    const newKey = `${hovered.col},${hovered.row}`

                    levelMap[hovered.row][hovered.col] = 4
                    
                    // Evaluate physical grid scale to determine default floor ID for initially placed obstacles
                    const isHalfWidth = colWidths[selTile.col] < 1 || rowDepths[selTile.row] < 1
                    const defaultFloorId = isHalfWidth ? 2 : 0
                    
                    // Restore the specific floor tile from memory or the evaluated default
                    levelMap[selTile.row][selTile.col] = obstacleMemory[oldKey] !== undefined ? obstacleMemory[oldKey] : defaultFloorId
                    
                    // Memorize the floor tile covered by the relocated obstacle
                    obstacleMemory[newKey] = targetId
                    delete obstacleMemory[oldKey]

                    selectedGroups[0][0] = {col: hovered.col, row: hovered.row, face: hovered.face}
                }
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
                hoveredGroup = [{col: hovered.col, row: hovered.row, face: hovered.face}]
                
                // Flag error if hovering an obstacle while a wall is selected
                if (selectedGroups.length === 1) {
                    const selId = levelMap[selectedGroups[0][0].row][selectedGroups[0][0].col]
                    if (selId === 1 || selId === 5) {
                        isHoverError = true
                    } else {
                        isHoverError = false
                        if (selId === 4 && selectedGroups[0][0].col === hovered.col && selectedGroups[0][0].row === hovered.row) {
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
    
    // By omitting the center offset here, we perfectly anchor the level center to 0,0
    const isoX = (rotX - rotY) * (TILE_WIDTH / 2)
    const isoY = (rotX + rotY) * (TILE_HEIGHT / 2) - (elevation * (TILE_HEIGHT / 2))
    
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

// Determine if a specific logical grid coordinate is walkable
function isWalkable(x, y) {
    const col = Math.floor(x)
    const row = Math.floor(y)
    if (row < 0 || row >= MAP_ROWS || col < 0 || col >= MAP_COLS) return false
    const tileId = levelMap[row][col]
    return !tileCollisions[tileId]
}

// Evaluate collision bounding box to prevent visual sprite clipping into adjacent walls
function checkCollision(x, y) {
    const r = 0.2 // Logical padding radius to account for physical sprite width
    return isWalkable(x - r, y - r) &&
           isWalkable(x + r, y - r) &&
           isWalkable(x - r, y + r) &&
           isWalkable(x + r, y + r)
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

    ctx.restore()
    requestAnimationFrame(loop)
}

// Execute game loop
loop()