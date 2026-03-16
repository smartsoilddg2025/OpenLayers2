/* Initialize MapLibre */
maplibregl.accessToken = 'none';

/* Firebase */
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-app.js";
import { getDatabase, ref, get } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-database.js";

/* --- Firebase Config --- */
const firebaseConfig = {
  databaseURL: "https://loraseminar-default-rtdb.firebaseio.com/"
};
const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

/* --- Username from URL --- */
const username = new URLSearchParams(window.location.search).get("user");
if (!username) {
  alert("⚠️ Please provide a username in the URL (e.g. ?user=jlcerna)");
  throw new Error("Username missing");
}

/* --- Initialize Map --- */
const map = new maplibregl.Map({
  container: 'map',
  style: {
    version: 8,
    sources: {
      satellite: {
        type: 'raster',
        tiles: [
          `https://api.maptiler.com/maps/satellite/256/{z}/{x}/{y}.jpg?key=k0zBlTOs7WrHcJIfCohH`
        ],
        tileSize: 256,
        attribution: '<a href="https://www.maptiler.com/" target="_blank">© MapTiler</a> © OpenStreetMap contributors'
      }
    },
    layers: [
      {
        id: 'satellite-layer',
        type: 'raster',
        source: 'satellite',
        minzoom: 0,
        maxzoom: 22
      }
    ]
  },
  center: [0, 0],
  zoom: 2
});

map.addControl(new maplibregl.NavigationControl(), 'top-right');

/* --- Store markers --- */
let markers = {};
let currentFarmData = null; // Store the latest farm data for refresh functionality

/* --- Function to load data ONCE (not real-time) --- */
function loadDataOnce() {
  console.log("Loading data from Firebase (one-time fetch)...");
  
  // Read the farm data from Firebase (one-time fetch, not real-time)
  const farmRef = ref(db, `Users/${username}/Farm`);
  
  get(farmRef).then((snapshot) => {
    const farmData = snapshot.val();
    console.log("Firebase data loaded:", farmData);
    
    // Store the data
    currentFarmData = farmData;
    
    // Clear existing markers
    Object.values(markers).forEach(marker => marker.remove());
    markers = {};
    
    if (!farmData) {
      console.log("No farm data found");
      return;
    }
    
    // Get all coordinates from nodes
    const coordinates = [];
    
    // First, check if there are farm-level coordinates
    if (farmData.Coordinates) {
      coordinates.push({
        lng: farmData.Coordinates.X,
        lat: farmData.Coordinates.Y,
        source: 'farm',
        name: 'Farm Location'
      });
    }
    
    // Then check all nodes (each node might have its own coordinates in the future)
    if (farmData.Nodes) {
      Object.entries(farmData.Nodes).forEach(([nodeName, nodeData]) => {
        // If node has its own coordinates, use those
        if (nodeData.Coordinates) {
          coordinates.push({
            lng: nodeData.Coordinates.X,
            lat: nodeData.Coordinates.Y,
            source: nodeName,
            name: nodeName,
            nodeData: nodeData
          });
        } 
        // Otherwise, if we have farm coordinates, use those for this node too
        else if (farmData.Coordinates) {
          coordinates.push({
            lng: farmData.Coordinates.X,
            lat: farmData.Coordinates.Y,
            source: nodeName,
            name: nodeName,
            nodeData: nodeData
          });
        }
      });
    }
    
    console.log(`Found ${coordinates.length} coordinates to plot`);
    
    if (coordinates.length === 0) {
      console.log("No coordinates found");
      return;
    }
    
    // Add markers for all coordinates with popups
    coordinates.forEach((coord, index) => {
      const markerColor = coord.source === 'farm' ? 'blue' : 'red';
      
      // Create marker
      const marker = new maplibregl.Marker({ color: markerColor })
        .setLngLat([coord.lng, coord.lat])
        .addTo(map);
      
      // Create popup content
      const popupContent = document.createElement('div');
      popupContent.className = 'popup-container';
      
      // --- TOP: Title with Refresh Button ---
      const topBar = document.createElement('div');
      topBar.className = 'popup-top-bar';
      
      const titleDiv = document.createElement('div');
      titleDiv.className = 'popup-title';
      titleDiv.textContent = 'LoRa Seminar Demo';
      
      const refreshBtn = document.createElement('button');
      refreshBtn.className = 'popup-refresh-btn';
      refreshBtn.innerHTML = '🔄';
      refreshBtn.title = 'Refresh data';
      
      // Refresh functionality - MANUAL REFRESH ONLY
      refreshBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        
        // Show spinning animation
        refreshBtn.style.animation = 'spin 1s linear';
        
        console.log("Manual refresh triggered by user...");
        
        // Fetch fresh data from Firebase (one-time)
        const farmRef = ref(db, `Users/${username}/Farm`);
        get(farmRef).then((snapshot) => {
          const freshData = snapshot.val();
          console.log("Fresh data loaded:", freshData);
          
          // Update current data
          currentFarmData = freshData;
          
          // Update the popup content with fresh data
          updatePopupContent(popupContent, freshData, coord);
          
          // Remove spinning animation
          setTimeout(() => {
            refreshBtn.style.animation = '';
          }, 500);
          
        }).catch(error => {
          console.error("Error refreshing data:", error);
          refreshBtn.style.animation = '';
        });
      });
      
      topBar.appendChild(titleDiv);
      topBar.appendChild(refreshBtn);
      popupContent.appendChild(topBar);
      
      // Initial content population
      updatePopupContent(popupContent, farmData, coord);
      
      // Create popup that appears on the side
      const popup = new maplibregl.Popup({
        closeButton: false, // Remove the default X button
        closeOnClick: false,
        offset: [15, -15],
        anchor: 'left',
        className: 'side-popup',
        maxWidth: '500px'
      }).setDOMContent(popupContent);
      
      // Attach popup to marker
      marker.setPopup(popup);
      
      // Toggle popup on marker click
      marker.getElement().addEventListener('click', (e) => {
        e.stopPropagation();
        
        if (popup.isOpen()) {
          popup.remove(); // Close if open
        } else {
          // Close any other open popups
          Object.values(markers).forEach(m => {
            const p = m.getPopup();
            if (p && p.isOpen()) p.remove();
          });
          
          popup.addTo(map); // Open this one
        }
      });
      
      // Store marker with a unique key
      const key = coord.source === 'farm' ? 'farm' : `node-${index}`;
      markers[key] = marker;
    });
    
    console.log(`${Object.keys(markers).length} markers added with manual refresh buttons!`);
    
    // Now find the country with the most coordinates
    findCountryWithMostNodes(coordinates);
    
  }).catch((error) => {
    console.error("Error loading data from Firebase:", error);
  });
}

/* --- Function to update popup content with fresh data --- */
function updatePopupContent(popupContent, farmData, coord) {
  // Clear existing content except the top bar
  while (popupContent.children.length > 1) {
    popupContent.removeChild(popupContent.lastChild);
  }
  
  // --- MAIN CONTENT AREA (with left and right columns) ---
  const mainContent = document.createElement('div');
  mainContent.className = 'popup-main-content';
  
  // LEFT SIDE: Raw per node
  const leftSide = document.createElement('div');
  leftSide.className = 'popup-left';
  leftSide.innerHTML = '<div class="section-header">📨 RAW</div>';
  
  const rawContent = document.createElement('div');
  rawContent.className = 'raw-content';
  
  // Add raw messages from all nodes
  if (farmData && farmData.Nodes) {
    Object.entries(farmData.Nodes).forEach(([nodeName, nodeData]) => {
      const packets = Object.values(nodeData.Packets || {});
      const latestPacket = packets.length > 0 ? packets[packets.length - 1] : null;
      
      const nodeRawDiv = document.createElement('div');
      nodeRawDiv.className = 'node-raw-item';
      nodeRawDiv.innerHTML = `
        <strong>${nodeName}:</strong> 
        <span class="raw-message">${latestPacket?.raw || 'No message yet'}</span>
      `;
      rawContent.appendChild(nodeRawDiv);
    });
  }
  
  leftSide.appendChild(rawContent);
  
  // RIGHT SIDE: Read Time and Reflected Time timestamps
  const rightSide = document.createElement('div');
  rightSide.className = 'popup-right';
  rightSide.innerHTML = '<div class="section-header">⏱️ TIMESTAMPS</div>';
  
  const timestampsContent = document.createElement('div');
  timestampsContent.className = 'timestamps-content';
  
  // Add timestamps from all nodes with proper naming
  if (farmData && farmData.Nodes) {
    Object.entries(farmData.Nodes).forEach(([nodeName, nodeData]) => {
      const packets = Object.values(nodeData.Packets || {});
      const latestPacket = packets.length > 0 ? packets[packets.length - 1] : null;
      
      if (latestPacket) {
        const nodeTimeDiv = document.createElement('div');
        nodeTimeDiv.className = 'node-time-item';
        nodeTimeDiv.innerHTML = `
          <strong>${nodeName}</strong><br>
          <span class="timestamp-receive">📥 Read Time stamp: ${latestPacket.receive_timestamp || 'N/A'}</span><br>
          <span class="timestamp-upload">📤 Reflected Time stamp: ${latestPacket.upload_timestamp || latestPacket.timestamp || 'N/A'}</span>
        `;
        timestampsContent.appendChild(nodeTimeDiv);
      } else {
        const nodeTimeDiv = document.createElement('div');
        nodeTimeDiv.className = 'node-time-item no-data';
        nodeTimeDiv.innerHTML = `
          <strong>${nodeName}</strong><br>
          <span>No data yet</span>
        `;
        timestampsContent.appendChild(nodeTimeDiv);
      }
    });
  }
  
  rightSide.appendChild(timestampsContent);
  
  // Add left and right to main content
  mainContent.appendChild(leftSide);
  mainContent.appendChild(rightSide);
  popupContent.appendChild(mainContent);
  
  // --- BOTTOM: Toggle Button ---
  const toggleBtn = document.createElement('button');
  toggleBtn.className = 'popup-toggle-btn';
  toggleBtn.textContent = '⬇️'; // Down arrow by default
  
  // Create extended content (hidden by default)
  const extendedContent = document.createElement('div');
  extendedContent.className = 'popup-extended';
  extendedContent.style.display = 'none';
  
  // Add RSSI and additional info to extended content
  if (farmData && farmData.Nodes) {
    Object.entries(farmData.Nodes).forEach(([nodeName, nodeData]) => {
      const packets = Object.values(nodeData.Packets || {});
      const latestPacket = packets.length > 0 ? packets[packets.length - 1] : null;
      
      const nodeExtendedDiv = document.createElement('div');
      nodeExtendedDiv.className = 'node-extended-item';
      nodeExtendedDiv.innerHTML = `
        <strong>${nodeName} Details:</strong><br>
        📶 RSSI: ${latestPacket?.rssi || 'N/A'} dBm<br>
        📍 Location: [${coord.lat.toFixed(4)}, ${coord.lng.toFixed(4)}]<br>
        📦 Total Packets: ${Object.keys(nodeData.Packets || {}).length}
      `;
      extendedContent.appendChild(nodeExtendedDiv);
    });
  }
  
  popupContent.appendChild(extendedContent);
  popupContent.appendChild(toggleBtn);
  
  // Toggle functionality
  toggleBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    const isExtended = extendedContent.style.display === 'block';
    
    if (isExtended) {
      // Collapse
      extendedContent.style.display = 'none';
      toggleBtn.textContent = '⬇️';
    } else {
      // Expand
      extendedContent.style.display = 'block';
      toggleBtn.textContent = '⬆️';
    }
  });
}

/* --- Function to find country with most nodes --- */
function findCountryWithMostNodes(coordinates) {
  console.log("Finding country with most nodes...");
  
  // Create geocoding promises for each coordinate
  const geocodePromises = coordinates.map(coord =>
    fetch(`https://api.maptiler.com/geocoding/${coord.lng},${coord.lat}.json?key=k0zBlTOs7WrHcJIfCohH`)
      .then(res => res.json())
      .catch(error => {
        console.error("Geocoding error:", error);
        return null;
      })
  );
  
  Promise.all(geocodePromises).then(results => {
    const countryCount = {};
    const countryBboxes = {};
    
    results.forEach((json, index) => {
      if (!json || !json.features) {
        console.log(`No geocoding result for coordinate ${index}`);
        return;
      }
      
      // Find the country feature
      const countryFeature = json.features.find(f => f.place_type.includes("country"));
      if (!countryFeature) {
        console.log(`No country found for coordinate ${index}`);
        return;
      }
      
      const country = countryFeature.properties.name;
      console.log(`Coordinate ${index} is in: ${country}`);
      
      // Count occurrences
      countryCount[country] = (countryCount[country] || 0) + 1;
      
      // Store bbox for the country if we haven't yet
      if (!countryBboxes[country] && countryFeature.bbox) {
        countryBboxes[country] = countryFeature.bbox;
      }
    });
    
    console.log("Country counts:", countryCount);
    
    // Find country with most nodes
    let maxCountry = null;
    let maxCount = 0;
    
    Object.entries(countryCount).forEach(([country, count]) => {
      if (count > maxCount) {
        maxCount = count;
        maxCountry = country;
      }
    });
    
    if (maxCountry) {
      console.log(`Country with most nodes: ${maxCountry} (${maxCount} nodes)`);
      
      const bbox = countryBboxes[maxCountry];
      if (bbox) {
        console.log("Zooming to bounding box:", bbox);
        
        // Fit map to the country's bounding box
        map.fitBounds(
          [
            [bbox[0], bbox[1]],
            [bbox[2], bbox[3]]
          ],
          {
            padding: 50,
            duration: 2000,
            essential: true
          }
        );
      } else {
        // If no bbox, just go to the first coordinate
        console.log("No bounding box found, going to first coordinate");
        const firstCoord = coordinates[0];
        map.flyTo({
          center: [firstCoord.lng, firstCoord.lat],
          zoom: 10,
          duration: 2000
        });
      }
    } else {
      console.log("No country found, going to first coordinate");
      const firstCoord = coordinates[0];
      map.flyTo({
        center: [firstCoord.lng, firstCoord.lat],
        zoom: 10,
        duration: 2000
      });
    }
  }).catch(error => {
    console.error("Error in geocoding promises:", error);
    
    // Fallback: just go to the first coordinate
    if (coordinates.length > 0) {
      const firstCoord = coordinates[0];
      map.flyTo({
        center: [firstCoord.lng, firstCoord.lat],
        zoom: 10,
        duration: 2000
      });
    }
  });
}

/* --- Load initial data when map loads (ONCE, not real-time) --- */
map.on('load', () => {
  console.log("Map loaded, loading initial data (one-time)...");
  loadDataOnce();
});

/* --- CSS Styling --- */
const style = document.createElement('style');
style.textContent = `
  .side-popup .maplibregl-popup-content {
    border-radius: 12px;
    box-shadow: 0 4px 20px rgba(0,0,0,0.15);
    padding: 0;
    overflow: hidden;
  }
  
  .popup-container {
    width: 500px;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  }
  
  .popup-top-bar {
    display: flex;
    justify-content: space-between;
    align-items: center;
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    padding: 10px 15px;
  }
  
  .popup-title {
    color: white;
    font-weight: bold;
    font-size: 16px;
    letter-spacing: 1px;
  }
  
  .popup-refresh-btn {
    background: rgba(255, 255, 255, 0.2);
    border: none;
    color: white;
    font-size: 18px;
    cursor: pointer;
    width: 32px;
    height: 32px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all 0.3s ease;
  }
  
  .popup-refresh-btn:hover {
    background: rgba(255, 255, 255, 0.3);
    transform: scale(1.1);
  }
  
  .popup-refresh-btn:focus {
    outline: none;
  }
  
  @keyframes spin {
    0% { transform: rotate(0deg); }
    100% { transform: rotate(360deg); }
  }
  
  .popup-main-content {
    display: flex;
    padding: 15px;
    gap: 15px;
    border-bottom: 1px solid #eee;
  }
  
  .popup-left, .popup-right {
    flex: 1;
  }
  
  .section-header {
    font-weight: bold;
    color: #666;
    font-size: 12px;
    margin-bottom: 10px;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }
  
  .raw-content, .timestamps-content {
    font-size: 11px;
  }
  
  .node-raw-item {
    margin-bottom: 8px;
    padding: 5px;
    background: #f8f9fa;
    border-radius: 4px;
  }
  
  .raw-message {
    color: #2c3e50;
    word-break: break-word;
  }
  
  .node-time-item {
    margin-bottom: 10px;
    padding: 8px;
    background: #f8f9fa;
    border-radius: 4px;
    font-size: 10px;
    line-height: 1.6;
  }
  
  .node-time-item.no-data {
    color: #999;
    font-style: italic;
  }
  
  .timestamp-receive {
    color: #27ae60;
    display: block;
  }
  
  .timestamp-upload {
    color: #e67e22;
    display: block;
  }
  
  .popup-extended {
    padding: 15px;
    background: #f1f8ff;
    border-top: 2px dashed #667eea;
    font-size: 11px;
  }
  
  .node-extended-item {
    margin-bottom: 10px;
    padding: 8px;
    background: white;
    border-radius: 6px;
    box-shadow: 0 1px 3px rgba(0,0,0,0.1);
  }
  
  .popup-toggle-btn {
    width: 100%;
    padding: 12px;
    background: white;
    border: none;
    border-top: 1px solid #eee;
    cursor: pointer;
    font-size: 18px;
    transition: all 0.3s ease;
  }
  
  .popup-toggle-btn:hover {
    background: #f8f9fa;
  }
  
  .popup-toggle-btn:focus {
    outline: none;
  }
`;
document.head.appendChild(style);
