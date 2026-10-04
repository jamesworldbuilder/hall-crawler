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