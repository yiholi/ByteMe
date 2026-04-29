//Byte Me! The JPG Eater
//Date: 2026/04/20
//Author: Yiho Li 
/*All the main idea and design is made by me, but with the help of Claude AI and Gemini AI: 
I acknowledge the use of Claude AI (https://claude.ai/share/59098225-cca1-4819-9ab6-fe23c64c41a4) 
and Gemini AI (https://gemini.google.com/share/a9486f338ae9) to debug code and to explain code to me.*/

/*
Reference:
Conceptual References
Albertini, A. (2015). Trusting files (and their formats). hack.lu. https://archive.hack.lu/2015/Albertini%20-%20Trusting%20files.pdf
Meaney, E. (n.d.). Hex-edit glitch tutorial with Evan Meaney [Video]. YouTube. https://www.youtube.com/watch?v=y03SsJqjluk

Web Foundations & Protocols
MDN Web Docs. (n.d.-a). The WebSocket API. https://developer.mozilla.org/en-US/docs/Web/API/WebSockets_API
MDN Web Docs. (n.d.-b). WebSocket: message event. https://developer.mozilla.org/en-US/docs/Web/API/WebSocket/message_event
MDN Web Docs. (n.d.-c). What is a web server? https://developer.mozilla.org/en-US/docs/Learn_web_development/Howto/Web_mechanics/What_is_a_web_server
MDN Web Docs. (n.d.-d). Writing WebSocket client applications. https://developer.mozilla.org/en-US/docs/Web/API/WebSockets_API/Writing_WebSocket_client_applications
Postman. (n.d.). WebSockets vs. HTTP: Key differences explained. Postman Blog. https://blog.postman.com/websockets-vs-http-key-differences-explained/

Graphics, Algorithms & Styling
Shiffman, D. (n.d.). Example 0.6: A Perlin noise walker. The Nature of Code. https://natureofcode.com/random/#example-06-a-perlin-noise-walker
The Coding Train. (2015, October 16). 8.7: The basics of CSS — p5.js tutorial [Video]. YouTube. https://www.youtube.com/watch?v=zGL8q8iQSQw
The Coding Train. (2017, March 21). How to use "Inverse Kinematics" to make it move [Video]. YouTube. https://www.youtube.com/watch?v=hbgDqyy8bIw
The Coding Train. (2020, April 26). Introduction to WebGL in p5.js [Video]. YouTube. https://www.youtube.com/watch?v=nqiKWXUX-o8

OS System & Python
Giampaolo, G. (n.d.). psutil documentation. Read the Docs. https://psutil.readthedocs.io
Langa, A. (n.d.). websockets documentation. Read the Docs. https://websockets.readthedocs.io
Python Software Foundation. (n.d.-a). asyncio — Asynchronous I/O. Python 3 Documentation. https://docs.python.org/3/library/asyncio.html
Python Software Foundation. (n.d.-b). json — JSON encoder and decoder. Python 3 Documentation. https://docs.python.org/3/library/json.html
Python Software Foundation. (n.d.-c). os — Miscellaneous operating system interfaces. Python 3 Documentation. https://docs.python.org/3/library/os.html
Solberg, K. A. (n.d.). GPUtil [Computer software]. GitHub. https://github.com/anderskm/gputil
Yesudeep, M., & contributors. (n.d.). watchdog documentation. Read the Docs. https://python-watchdog.readthedocs.io
Tools
HexEd.it. (n.d.). HexEd.it - Online hex editor. https://hexed.it/
*/

// WebSocket and Synchronization Settings
const WS_URL = 'ws://localhost:8765'; // WebSocket server address
let socket;  
let connectionStatus = false; // Ask: Is the server connected?

// Caterpillar Dynamics Parameters
let currentSegments = 0; // Number of balls to draw, linked to folder count
let maxSegments = 100; // Maximum allowed balls
let segLength = 30;  // Distance between each ball

// Coordinate Arrays for each segment
// Initialize these parameters to 0 for easy calculations
/* I used x, y, and z to store the 3D coordinates of each segment(ball). 
By filling them with zeros, I saved the performance cost of creating new arrays every frame*/
let x = new Array(maxSegments).fill(0);
let y = new Array(maxSegments).fill(0);
let z = new Array(maxSegments).fill(0);

// Autonomous Movement Noise (Perlin Noise offsets)
/* Following "The Nature of Code" Example 0.6: A Perlin Noise Walker:
I used different starting offsets (noise values) for each axis.
This ensures X, Y, and Z movements are independent and uncorrelated.*/
let noiseOffsetX = 0; 
let noiseOffsetY = 1000; 
let noiseOffsetZ = 2000; 

// Data Storage for Caterpillar Memory
let segmentFolderNames = new Array(maxSegments).fill('');  // Stores folder names
let segmentMemory = new Array(maxSegments).fill(null); // Stores if a segment has "eaten" a jpg   

// Feeding Animation Settings
let feedingNodeIndex = -1; // Which ball is currently eating    
let feedingFrameStart = -1;  // The time (frame) when eating started  
const FEEDING_DURATION = 180;  // How long the eating lasts

// Slow Digestion Timer (Visual Cleanup)
let lastEatTime = 0;
let eatIndex = 0; 
const EAT_INTERVAL = 200; // Change background text every 0.2 seconds

// How to change the code on the Matrix background:
// false: Show the real HEX data of the "eaten" file (e.g., 4F, A2, E3).
// true: Start the "cleaner"; it slowly reverts HEX data back to "00" or "01"
let isCleaningUp = false; 

// Computer Performance Stats
let systemStats = { cpu: 0, ram: 0, gpu: 0 };

// Matrix Background Generator
// Visual texture for rendering the real HEX data characters
/* There are a lot of characters, which can not be drawn directly on 3D objects. 
 so I put the characters onto a black "virtual wall" (HEX Texture) */
let hexTexture;
const DEAD_PATTERN = ["00", "01"]; // Basic data units representing corrupted or null patterns
let criticalData = []; // Data pool containing HEX values currently displayed on the background wall
let deadFileList = []; // A collection list to store the names of all corrupted or destroyed files

/*Updates the Matrix background texture*/
function updateHexTexture() {
    // Set a very dark background color for the texture
    hexTexture.background(5, 5, 15);
    // Use a monospaced font to keep hexadecimal characters aligned
    hexTexture.textFont('Courier New');
    
    // Set the font size
    let mySize = 24; 
    hexTexture.textSize(mySize);

    // Calculate spacing to ensure large characters do not overlap
    let charW = mySize * 2.2; 
    let charH = mySize * 1.6; 

    // Calculate how many columns and rows are needed to fill the texture black wall
    let cols = ceil(hexTexture.width / charW);
    let rows = ceil(hexTexture.height / charH);
    let totalNeeded = cols * rows;

    // Keep adding data until there are enough numbers to fill the entire screen.
    // This ensures the background is always full, even if I resize the window.
    while (criticalData.length < totalNeeded) {
        // Create a clean "00 01" pattern:
        // If the current count is even, add "00". If it is odd, add "01".
        criticalData.push(criticalData.length % 2 === 0 ? "00" : "01");
    }

    // Slow Digestion & Visual Cleanup Logic 
    // This block runs only when the "isCleaningUp" flag is triggered (True)
    if (isCleaningUp) {
        let now = millis(); // Get the current system time 
        if (now - lastEatTime > EAT_INTERVAL) {
            // Clean the background one by one
            if (eatIndex < criticalData.length) {
                // Change data to "00" or "01" from the real HEX 
                criticalData[eatIndex] = (eatIndex % 2 === 0) ? "00" : "01";
                eatIndex++; 
            } else {
                // Finished! Turn off the cleaner
                isCleaningUp = false; // Stop the process once all data is cleared
            }
            lastEatTime = now; // Save the time
        }
    }

    // Drawing Loop (Static Display Rendering)
    for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
            // Calculate the unique index for each character in the 1D criticalData array
            let idx = r * cols + c;
            
            // Basic flickering logic: 
            // Use Perlin noise to create a smooth, organic blinking effect
            let flicker = map(noise(idx, frameCount * 0.03), 0, 1, 50, 200);
            // Set text color to "Matrix Green" with the calculated flickering opacity (alpha)
            hexTexture.fill(0, 255, 65, flicker);
            
            // Coordinate calculation: 
            // Offset the positions slightly to prevent text from being clipped at the edges
            let xPos = c * charW + 5; 
            let yPos = (r * charH) + (mySize * 0.9);
            
            // Check if the current index exists in the data pool before drawing
            if (idx < criticalData.length) {
                // Draw the HEX string (e.g., "00", "FF") at the calculated position
                hexTexture.text(criticalData[idx], xPos, yPos);
            }
        }
    }
}

function setup() {
    // Create a 3D canvas that fills the entire browser window
    // WEBGL mode allows for 3D transformations and advanced shaders
    createCanvas(windowWidth, windowHeight, WEBGL);
    /* REASON: 3D mode (WEBGL) is slow at drawing text,
    so I put text on this 2D wall first, then stick it to the WEBGL to keep the animation smooth.*/
    hexTexture = createGraphics(windowWidth, 600); 
    // Initialize the WebSocket connection to start communication with the Python server
    // This is used for real-time data exchange (such as receiving file status)
    connectWebSocket(); // Connect to the Python to start receiving data
}

// Open the webpage using "http://localhost:8000" instead of VS Code's "Live Server".
/* REASON: Live Server automatically refreshes the page whenever a file changes. 
   Since the Python script constantly adds files to the folder, 
   using a standard local server prevents unwanted page reloads 
   and keeps 3D animation running smoothly.*/
function connectWebSocket() {
    /* This line sends a connection request to the WS_URL 
       and waits for the Python server to answer. */
    socket = new WebSocket(WS_URL);

    // Triggered when the WebSocket connection is successfully on
    socket.onopen = () => {
        connectionStatus = true;
        updateUI(true);
    };

    // Main logic for handling incoming data from Python
    // Based on the Python data, p5js will show different events (feed, corrupted)
    socket.onmessage = (event) => {
        /* Why use JSON?
           REASON: Python sends data as a long string (text). 
           JSON.parse converts that text into a JavaScript Object 
           so I can use "data.event" or "data.hex" easily.*/
        let data = JSON.parse(event.data);
        console.log(event.data);

        // CASE 1: The system is "feeding" on a new file
        if (data.event === 'feed') {
            let targetIndex = segmentFolderNames.indexOf(data.folder);
            if (targetIndex !== -1) {
                feedingNodeIndex = targetIndex;
                feedingFrameStart = frameCount;
                segmentMemory[targetIndex] = {
                    hex: data.hex,
                    filename: data.filename
                };

                // When feeding starts: Fill the background data pool with the image's real HEX data
                let mySize = 24;
                let totalNeeded = ceil(hexTexture.width / (mySize * 2.2)) * ceil(hexTexture.height / (mySize * 1.6));
                
                criticalData = []; // Clear the current pool
                for (let i = 0; i < totalNeeded; i++) {
                    // Repeat the incoming hex data to fill the required screen area
                    criticalData.push(data.hex[i % data.hex.length]);
                }
                
                eatIndex = 0; 
                isCleaningUp = false; // Pause the 00/01 cleanup to display the "new food" data
                lastEatTime = millis();

                // Combine folder and filename to get the exact file path
                let filePath = 'monitored_folder/' + data.folder + '/' + data.filename;
                // Update the website's text/UI to show: "Now eating: filename"
                updateFeedingUI(data.filename, filePath, 'eating');
            }
        } 
        // CASE 2: A file has been marked as "corrupted" (meaning its HEX data has changed into 00/01)
        else if (data.event === 'corrupted') {
            // Trigger segment cleanup: Background starts turning back into 00 and 01 (5 sets per second)
            isCleaningUp = true;
            eatIndex = 0; 
            lastEatTime = millis();

            let fullName = data.folder + '/' + data.filename;
            // Add to the list of corrupted files if not already present
            if (!deadFileList.includes(fullName)) {
                deadFileList.push(fullName);
            }
            
            updateDeadFileListUI();
            let filePath = 'monitored_folder/' + data.folder + '/' + data.filename;
            updateFeedingUI(data.filename, filePath, 'dead');
        } 
        // CASE 3: General system status updates (CPU, RAM, Folder counts)
        else {
            let newCount = data.count;
            let folders = data.folders || [];
            systemStats = data.system || { cpu: 0, ram: 0, gpu: 0 };
            currentSegments = newCount;
            
            // Map the active folder names to the local segments
            for (let i = 0; i < maxSegments; i++) {
                segmentFolderNames[i] = folders[i] || '';
            }
            
            let countEl = document.getElementById('folderCount');
            if (countEl) countEl.innerText = newCount;
            
            updateSystemUI();
        }
    };

    // Triggered when the connection to the Python server is lost
    socket.onclose = () => {
        connectionStatus = false;
        updateUI(false);
        // Automatically try to reconnect every 5 seconds
        setTimeout(connectWebSocket, 5000);
    };
}

 
// Link JavaScript variables to the HTML elements
function updateUI(connected) {
    // Find the dot element and store it in a variable for CSS styling
    const statusEl = document.getElementById('status');// The visual indicator (dot)
    // Find the text label to update the connection message later 
    const textEl = document.getElementById('connection-text'); // The status message (label)

    // Ensure both elements exist before doing next actions.
    if (statusEl && textEl) {
        // SUCCESS: when the connection is on (true)
        if (connected) {
            // Change the CSS class to show a Green dot
            statusEl.className = 'status connected';
            // Change the text content to say "Connected"
            textEl.textContent = 'Connected';
        // FAIL: when the connection is lost (false)
        } else {
            // Change the CSS class to show a Red dot
            statusEl.className = 'status disconnected';
            // Change the text content to say "Disconnected"
            textEl.textContent = 'Disconnected';
        }
    }
}

/*
  Updates the System UI dashboard by refreshing the CPU, RAM, and GPU bars.
  This function uses the latest data stored in the global systemStats object.
*/
function updateSystemUI() {
    // Pass the specific bar IDs and the corresponding percentage values to updateBar
    updateBar('cpu-bar', 'cpu-value', systemStats.cpu);
    updateBar('ram-bar', 'ram-value', systemStats.ram);
    updateBar('gpu-bar', 'gpu-value', systemStats.gpu);
}

function updateBar(barId, valueId, percent) {
    let bar = document.getElementById(barId); // Find the bar element in the HTML
    let val = document.getElementById(valueId); // Find the text label element
    
    // If the bar element exists, adjust its CSS width to reflect the percentage
    if (bar) {
        bar.style.width = percent + '%';
    }
    
    // If the label element exists, update its text content (e.g., "75%")
    if (val) {
        val.textContent = percent + '%';
    }
}

// Main Animation of the Caterpillar
function draw() {

    background(0);
    // 1. Render the Background Data Stream Wall (Matrix Hex Texture)
    updateHexTexture();
    push();
    noStroke();
    translate(0, 0, -400); // Push to back to avoid overlap with character
    texture(hexTexture);
    plane(windowWidth, 600);
    pop();

    drawDoubleGrid(); // Render the background 3D grids
    drawStars(); // Render the stars in the background         

    // If not connected to the backend, stop the function here.
    // This prevents drawing the caterpillar when data is unavailable.
    if (!connectionStatus) return;

    // 2. Lighting on the Caterpillar
    ambientLight(60); // Soft overall lighting
    if (currentSegments > 0) {
        // Create a blue-ish point light that follows the head position
        pointLight(100, 200, 255, x[0], y[0], z[0] + 50);
    }

    // 3. Calculate Head Path using Perlin Noise
    /* Use p5.js noise() to get smooth values between 0 and 1
       Then use map() to scale those values to the 3D coordinate space */
    let autoTargetX = map(noise(noiseOffsetX), 0, 1, -width / 3, width / 3);
    let autoTargetY = map(noise(noiseOffsetY), 0, 1, -height / 3, height / 3);
    let autoTargetZ = map(noise(noiseOffsetZ), 0, 1, -300, 300);

    // Increment offsets to animate the noise values over time (smaller = smoother)
    noiseOffsetX += 0.005;
    noiseOffsetY += 0.005;
    noiseOffsetZ += 0.005;

    // 4. Update Segment Positions (Inverse Kinematics)
    /* Based on Daniel Shiffman's Inverse Kinematics logic:
       The head follows the target, and each following segment "drags" behind the previous one. */
    if (currentSegments > 0) {
        // The head (index 0) moves toward the noise-generated target
        dragSegment3D(0, autoTargetX, autoTargetY, autoTargetZ);
        
        // Loop through the body: each segment follows the one before it
        for (let i = 1; i < currentSegments; i++) {
            dragSegment3D(i, x[i - 1], y[i - 1], z[i - 1]);
        }
    }

    // 5. Render the Caterpillar Body (balls)
    noStroke();
    for (let i = 0; i < currentSegments; i++) {
        push();
        translate(x[i], y[i], z[i]);
        
        // Add self-rotation to each segment for a more dynamic look
        rotateY(frameCount * 0.02 + i * 0.3);
        rotateX(frameCount * 0.01);
        
        // Scale brightness: Head (i=0) is bright, Tail is dimmer
        let emission = map(i, 0, currentSegments || 1, 255, 50);
        emissiveMaterial(0, emission * 0.5, emission);

        // Scale size: Head is larger (45px), Tail is smaller (15px)
        let sz = map(i, 0, currentSegments || 1, 45, 15);

        // Color State Logic
        // Fed segments change color 
        if (segmentMemory[i] !== null) {
            fill(255, 140, 0); // Orange-ish for "Full" nodes
        } else {
            fill(255, 204, 0); // Yellow for "Empty" nodes
        }

        // Feeding Animation (Flash & Pulse)
        let sizeMult = 1.0;
        if (i === feedingNodeIndex && feedingFrameStart !== -1) {
            let elapsed = frameCount - feedingFrameStart;
            if (elapsed < FEEDING_DURATION) {
                let progress = elapsed / FEEDING_DURATION;
                // Sine wave pulse that gradually stabilizes
                let pulse = sin(elapsed * 0.3) * (1 - progress);
                sizeMult = 1 + pulse * 0.6;
                // Sudden glow effect that fades out
                emissiveMaterial(255 * (1 - progress), 100 * (1 - progress), 0);
            }
        }

        // Draw the main body part
        sphere((sz / 2) * sizeMult);

        // Inner Shinning Effect 
        // Draws a small, glowing white box inside the sphere
        emissiveMaterial(255);
        fill(255);
        box(sz * 0.2);
        pop();
    }
}

// Logic for smooth movement/dragging between segments (balls)
function dragSegment3D(i, tx, ty, tz) {
    let dx = tx - x[i];
    let dy = ty - y[i];
    let dz = tz - z[i];
    let d = sqrt(dx * dx + dy * dy + dz * dz);
    if (d > 0) {
        // Constrain the distance to maintain the body length
        x[i] = tx - (dx / d) * segLength;
        y[i] = ty - (dy / d) * segLength;
        z[i] = tz - (dz / d) * segLength;
    }
}

/*Renders two parallel 3D grids (top and bottom) to create a sense of scale and depth.*/
function drawDoubleGrid() {
    // Set the grid line color to a semi-transparent tech-blue
    stroke(100, 150, 255, 100);
    // Set the thickness of the grid lines
    strokeWeight(2);

    // 1. Draw the Bottom Grid (The Floor)
    push(); 
    translate(0, 400, 0); // Move down 400 pixels on the Y-axis
    rotateX(HALF_PI);     // Rotate 90 degrees to lay it flat
    drawGridLines();      // Call the helper function to draw the actual lines
    pop();

    // 2. Draw the Top Grid (The Ceiling)
    push(); 
    translate(0, -400, 0); // Move up 400 pixels on the Y-axis
    rotateX(HALF_PI);      // Rotate 90 degrees to lay it flat
    drawGridLines();       // Call the helper function to draw the actual lines
    pop();
}

// Draws the top and bottom perspective grids for the movement of the caterpillar
function drawGridLines() {
    // Create a grid by drawing 21 horizontal and 21 vertical lines
    for (let i = -10; i <= 10; i++) {
        // Vertical lines (Top to Bottom)
        line(i * 100, -1000, i * 100, 1000);
        // Horizontal lines (Left to Right)
        line(-1000, i * 100, 1000, i * 100);
    }
}

// Draws static random background stars
function drawStars() {
    push();
    stroke(255, 150);
    randomSeed(99);
    for (let i = 0; i < 150; i++) {
        point(random(-width, width), random(-height, height), random(-1200, 200));
    }
    pop();
}

// Ensures the canvas fits the browser if the window changes size
// The browser "fires" this function only when it detects the user has dragged the window corner
function windowResized() {
    // Adjust the main 3D canvas to match the new browser dimensions
    resizeCanvas(windowWidth, windowHeight);
    
    // Synchronize the texture size when the window changes.
    // This prevents the "Matrix Wall" from looking stretched or clipped.
    hexTexture = createGraphics(windowWidth, 600); 
}

// Updates the corrupted file list on the left sidebar
function updateDeadFileListUI() {
    // Attempt to find the container element for the dead file list
    let listEl = document.getElementById('dead-file-list');
    // Safety check: If the element doesn't exist in the HTML, exit the function
    if (!listEl) return;

    // Clear all existing items to refresh the list from scratch
    listEl.innerHTML = '';

    // Loop through the array of corrupted file names
    deadFileList.forEach(name => {
        // Create a new <div> element for each corrupted file
        let item = document.createElement('div');

        // Assign a CSS class for styling (e.g., green/red text, borders)
        item.className = 'dead-file-item';

        // Add a skull emoji and the filename as the display text
        item.textContent = '💀 ' + name;

        // Append the new item into the list container
        listEl.appendChild(item);
    });
    // Ensure the entire "Dead File Section" is visible once a file is added
    document.getElementById('dead-file-section').style.display = 'block';
}

// Updates the UI panel that shows information about the current file being "eaten."
function updateFeedingUI(filename, filePath, status) {
    let panel   = document.getElementById('feeding-info');
    let badge   = document.getElementById('feeding-status-badge');
    let fnEl    = document.getElementById('feeding-filename');
    let preview = document.getElementById('feeding-preview');

    // Safety check: Exit if the UI panel doesn't exist
    if (!panel) return;
    
    // Make sure the info panel is visible
    panel.style.display = 'block';

    // Update the filename display with a document icon
    fnEl.textContent = '📄 ' + filename;

    // Define label text for different system states
    const labels = {
        ready:  '📥 JPG FOOD LOADED',
        eating: '🐛 EATING...',
        dead:   '💀 DIGESTED'
    };
    
    // Update the badge text and apply a dynamic CSS class (e.g., status-eating)
    badge.textContent = labels[status] || '';
    badge.className = 'status-' + status;

    // Handle the Image Preview logic
    if (filePath) {
        /* Add a timestamp (?t=...) to the URL to bypass the browser's cache.
           This ensures that if a file is overwritten, the UI shows the new version.
           Note: In 'dead' status, this may show a broken icon because the file is deleted/moved.
        */
        preview.src = filePath + '?t=' + Date.now(); 
        preview.style.display = 'block';
    } else {
        // Hide the preview if no file path is provided
        preview.src = '';
        preview.style.display = 'none';
    }
}