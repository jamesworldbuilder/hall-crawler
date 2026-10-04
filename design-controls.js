// Cache UI elements
const sizeSlider = document.getElementById('tile-size')
const pitchSlider = document.getElementById('camera-pitch')
const zoomSlider = document.getElementById('zoom')
const rotSlider = document.getElementById('rotation')
const sizeVal = document.getElementById('size-val')
const pitchVal = document.getElementById('pitch-val')
const zoomVal = document.getElementById('zoom-val')
const rotVal = document.getElementById('rot-val')
const exportOut = document.getElementById('export-out')

// Store history for undo functionality
const historyStack = []

// Push current state to history stack
function saveState() {
    historyStack.push({ s: TILE_SIZE, p: CAMERA_PITCH, z: ZOOM, r: ROTATION })
    if (historyStack.length > 100) historyStack.shift()
}

// Bind save state events to slider interactions
function attachSave(element) {
    element.addEventListener('mousedown', saveState)
    element.addEventListener('touchstart', saveState)
}
attachSave(sizeSlider)
attachSave(pitchSlider)
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
attachStepper('zoom', 'btn-z-down', 'btn-z-up', 0.1)
attachStepper('rotation', 'btn-r-down', 'btn-r-up', 90)

// Update values visually during drag and button steps
sizeSlider.addEventListener('input', (e) => {
    TILE_SIZE = parseInt(e.target.value)
    sizeVal.innerText = TILE_SIZE
})
pitchSlider.addEventListener('input', (e) => {
    CAMERA_PITCH = parseInt(e.target.value)
    pitchVal.innerText = CAMERA_PITCH
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
        ZOOM = lastState.z
        ROTATION = lastState.r
        
        sizeSlider.value = TILE_SIZE
        pitchSlider.value = CAMERA_PITCH
        zoomSlider.value = ZOOM
        rotSlider.value = ROTATION
        
        sizeVal.innerText = TILE_SIZE
        pitchVal.innerText = CAMERA_PITCH
        zoomVal.innerText = ZOOM.toFixed(1)
        rotVal.innerText = ROTATION
    }
})

// Export updated script variables
document.getElementById('btn-export').addEventListener('click', () => {
    exportOut.style.display = 'block'
    exportOut.value = `let TILE_SIZE = ${TILE_SIZE}\nlet CAMERA_PITCH = ${CAMERA_PITCH}\nlet ZOOM = ${ZOOM}\nlet ROTATION = ${ROTATION}\nlet cameraX = ${cameraX}\nlet cameraY = ${cameraY}`
})
