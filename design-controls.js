// Cache UI elements
const sizeSlider = document.getElementById('tile-size')
const pitchSlider = document.getElementById('camera-pitch')
const wallSlider = document.getElementById('wall-height')
const obsSlider = document.getElementById('obs-height')
const zoomSlider = document.getElementById('zoom')
const rotSlider = document.getElementById('rotation')
const sizeVal = document.getElementById('size-val')
const pitchVal = document.getElementById('pitch-val')
const wallVal = document.getElementById('wall-val')
const obsVal = document.getElementById('obs-val')
const zoomVal = document.getElementById('zoom-val')
const rotVal = document.getElementById('rot-val')
const exportOut = document.getElementById('export-out')

// Store history for undo functionality
const historyStack = []

// Push current state to history stack
function saveState() {
    historyStack.push({ s: TILE_SIZE, p: CAMERA_PITCH, wh: WALL_HEIGHT, oh: OBS_HEIGHT, z: ZOOM, r: ROTATION })
    if (historyStack.length > 100) historyStack.shift()
}

// Bind save state events to slider interactions
function attachSave(element) {
    element.addEventListener('mousedown', saveState)
    element.addEventListener('touchstart', saveState)
}
attachSave(sizeSlider)
attachSave(pitchSlider)
attachSave(wallSlider)
attachSave(obsSlider)
attachSave(zoomSlider)
attachSave(rotSlider)

// Helper logic to step sliders programmatically with UI buttons
function attachStepper(inputId, btnDownId, btnUpId, stepValue) {
    const input = document.getElementById(inputId)
    document.getElementById(btnDownId).addEventListener('click', () => {
        saveState()
        let nextVal = parseFloat(input.value) - stepValue
        if (nextVal < parseFloat(input.min)) nextVal = parseFloat(input.max)
        input.value = nextVal
        input.dispatchEvent(new Event('input'))
    })
    document.getElementById(btnUpId).addEventListener('click', () => {
        saveState()
        let nextVal = parseFloat(input.value) + stepValue
        if (nextVal > parseFloat(input.max)) nextVal = parseFloat(input.min)
        input.value = nextVal
        input.dispatchEvent(new Event('input'))
    })
}

// Bind custom step increments to interface arrows (5 units for size, dynamic for rest)
attachStepper('tile-size', 'btn-ts-down', 'btn-ts-up', 5)
attachStepper('camera-pitch', 'btn-p-down', 'btn-p-up', 10)
attachStepper('wall-height', 'btn-wh-down', 'btn-wh-up', 0.1)
attachStepper('obs-height', 'btn-oh-down', 'btn-oh-up', 0.1)
attachStepper('zoom', 'btn-z-down', 'btn-z-up', 0.1)
attachStepper('rotation', 'btn-r-down', 'btn-r-up', 90)

// Update values visually during drag and button steps
sizeSlider.addEventListener('input', (e) => {
    TILE_SIZE = parseInt(e.target.value)
    sizeVal.innerText = TILE_SIZE
})
pitchSlider.addEventListener('input', (e) => {
    let val = parseInt(e.target.value)
    
    // Snap to top-down view for any angle over 40
    if (val > 40 && val < 90) {
        val = CAMERA_PITCH === 90 ? 40 : 90
        pitchSlider.value = val
    } 
    // Snap to direct side-view for any angle under 10
    else if (val > 0 && val < 10) {
        val = CAMERA_PITCH === 0 ? 10 : 0
        pitchSlider.value = val
    }
    
    CAMERA_PITCH = val
    pitchVal.innerText = CAMERA_PITCH
    
    // Auto-adjust zoom and center camera to fit bounds perfectly when snapping to 90 degrees
    if (CAMERA_PITCH === 90) {
        const totalW = colWidths.reduce((a, b) => a + b, 0) * TILE_SIZE
        const totalH = rowDepths.reduce((a, b) => a + b, 0) * TILE_SIZE
        
        const rad = ROTATION * Math.PI / 180
        const cos = Math.abs(Math.cos(rad))
        const sin = Math.abs(Math.sin(rad))
        
        const boundW = totalW * cos + totalH * sin
        const boundH = totalW * sin + totalH * cos
        
        let optimalZoom = Math.min(canvas.width / boundW, canvas.height / boundH) * 0.9
        optimalZoom = Math.max(parseFloat(zoomSlider.min), Math.min(parseFloat(zoomSlider.max), optimalZoom))
        
        ZOOM = Math.round(optimalZoom * 10) / 10
        zoomSlider.value = ZOOM
        zoomVal.innerText = ZOOM.toFixed(1)
        
        cameraX = 0
        cameraY = 0
    }
})
wallSlider.addEventListener('input', (e) => {
    WALL_HEIGHT = parseFloat(e.target.value)
    wallVal.innerText = WALL_HEIGHT.toFixed(1)
    tileHeights[1] = WALL_HEIGHT
    tileHeights[5] = WALL_HEIGHT
    
    if (OBS_HEIGHT > WALL_HEIGHT) {
        OBS_HEIGHT = WALL_HEIGHT
        obsSlider.value = OBS_HEIGHT
        obsVal.innerText = OBS_HEIGHT.toFixed(1)
        tileHeights[4] = OBS_HEIGHT
    }
})
obsSlider.addEventListener('input', (e) => {
    let val = parseFloat(e.target.value)
    if (val > WALL_HEIGHT) {
        val = WALL_HEIGHT
        obsSlider.value = val
    }
    OBS_HEIGHT = val
    obsVal.innerText = OBS_HEIGHT.toFixed(1)
    tileHeights[4] = OBS_HEIGHT
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
        TILE_SIZE = lastState.s
        CAMERA_PITCH = lastState.p
        WALL_HEIGHT = lastState.wh
        OBS_HEIGHT = lastState.oh
        ZOOM = lastState.z
        ROTATION = lastState.r
        
        sizeSlider.value = TILE_SIZE
        pitchSlider.value = CAMERA_PITCH
        wallSlider.value = WALL_HEIGHT
        obsSlider.value = OBS_HEIGHT
        zoomSlider.value = ZOOM
        rotSlider.value = ROTATION
        
        sizeVal.innerText = TILE_SIZE
        pitchVal.innerText = CAMERA_PITCH
        wallVal.innerText = WALL_HEIGHT.toFixed(1)
        obsVal.innerText = OBS_HEIGHT.toFixed(1)
        zoomVal.innerText = ZOOM.toFixed(1)
        rotVal.innerText = ROTATION
        
        tileHeights[1] = WALL_HEIGHT
        tileHeights[5] = WALL_HEIGHT
        tileHeights[4] = OBS_HEIGHT
    }
})

// Export updated script variables
document.getElementById('btn-export').addEventListener('click', () => {
    exportOut.style.display = 'block'
    exportOut.value = `let TILE_SIZE = ${TILE_SIZE}\nlet CAMERA_PITCH = ${CAMERA_PITCH}\nlet WALL_HEIGHT = ${WALL_HEIGHT}\nlet OBS_HEIGHT = ${OBS_HEIGHT}\nlet ZOOM = ${ZOOM}\nlet ROTATION = ${ROTATION}\nlet cameraX = ${cameraX}\nlet cameraY = ${cameraY}`
})