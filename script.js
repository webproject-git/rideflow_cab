// Initialize map with a premium CartoDB Dark Matter tile layer
let map = L.map('map', { zoomControl: false }).setView([28.6139, 77.2090], 13);

L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/dark_all/{z}/{x}/{y}{r}.png', {
  attribution: '&copy; OpenStreetMap &copy; CARTO',
  subdomains: 'abcd',
  maxZoom: 20
}).addTo(map);

let pickupMarker = null;
let dropMarker = null;
let routingControl = null;

let pickupCoords = null;
let dropCoords = null;

let selectingMode = false;
let step = 0;

let selectedRidePrice = 10;
let currentDistanceKm = 0; // Stored to recalculate fare without re-routing

// Custom Markers for a premium look
const pickupIcon = L.divIcon({
    className: 'custom-marker',
    html: `<div style="background-color:#00e676; width:14px; height:14px; border-radius:50%; border:2px solid #fff; box-shadow: 0 0 10px rgba(0,230,118,0.8);"></div>`,
    iconSize: [14, 14],
    iconAnchor: [7, 7]
});

const dropIcon = L.divIcon({
    className: 'custom-marker',
    html: `<div style="background-color:#ff3d00; width:14px; height:14px; border-radius:50%; border:2px solid #fff; box-shadow: 0 0 10px rgba(255,61,0,0.8);"></div>`,
    iconSize: [14, 14],
    iconAnchor: [7, 7]
});

/* Reverse Geocode */
async function getPlaceName(lat, lon) {
  try {
    let res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}`);
    let data = await res.json();
    // Clean up the name for UI
    let parts = data.display_name.split(',');
    return parts[0] + (parts[1] ? ',' + parts[1] : '') || "Selected Location";
  } catch {
    return "Selected Location";
  }
}

/* AUTOCOMPLETE */
async function fetchLocations(query) {
  try {
    let res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${query}&addressdetails=1`);
    return await res.json();
  } catch {
    return [];
  }
}

function setupAutocomplete(inputId, boxId, isPickup) {
  let input = document.getElementById(inputId);
  let box = document.getElementById(boxId);
  let debounceTimer;

  input.addEventListener("input", () => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(async () => {
      let query = input.value.trim();
      if (query.length < 3) {
        box.innerHTML = "";
        return;
      }
      let places = await fetchLocations(query);
      box.innerHTML = "";

      places.slice(0, 4).forEach(place => {
        let div = document.createElement("div");
        let nameParts = place.display_name.split(',');
        div.innerText = nameParts[0] + (nameParts[1] ? ',' + nameParts[1] : '');

        div.onclick = () => {
          input.value = div.innerText;
          box.innerHTML = "";
          let latlng = [parseFloat(place.lat), parseFloat(place.lon)];

          if (isPickup) setPickup(latlng, input.value);
          else setDrop(latlng, input.value);

          map.flyTo(latlng, 15, { duration: 1.5 });
        };
        box.appendChild(div);
      });
    }, 500); // Slightly longer debounce to prevent API spam
  });

  document.addEventListener("click", (e) => {
    if (!input.contains(e.target)) box.innerHTML = "";
  });
}

setupAutocomplete("pickup", "pickupSuggestions", true);
setupAutocomplete("drop", "dropSuggestions", false);

/* Map Select Mode */
document.getElementById("mapSelectBtn").onclick = () => {
  selectingMode = true;
  step = 1;
  document.getElementById("mapSelectBtn").innerText = "Tap Map for Pickup";
  document.getElementById("mapSelectBtn").style.borderColor = "#00e676";
  document.getElementById("mapSelectBtn").style.color = "#00e676";
};

/* Map Click */
map.on('click', async function(e) {
  if (!selectingMode) return;

  let latlng = [e.latlng.lat, e.latlng.lng];
  let name = await getPlaceName(latlng[0], latlng[1]);

  if (step === 1) {
    setPickup(latlng, name);
    step = 2;
    document.getElementById("mapSelectBtn").innerText = "Tap Map for Drop";
    document.getElementById("mapSelectBtn").style.borderColor = "#ff3d00";
    document.getElementById("mapSelectBtn").style.color = "#ff3d00";
  } else if (step === 2) {
    setDrop(latlng, name);
    selectingMode = false;
    step = 0;
    
    // Reset button style
    let btn = document.getElementById("mapSelectBtn");
    btn.innerText = "Select from Map";
    btn.style.borderColor = "rgba(255,255,255,0.2)";
    btn.style.color = "rgba(255,255,255,0.7)";
  }
});

/* Set Pickup */
function setPickup(latlng, name) {
  if (pickupMarker) map.removeLayer(pickupMarker);
  pickupMarker = L.marker(latlng, {icon: pickupIcon}).addTo(map);
  pickupCoords = latlng;
  document.getElementById("pickup").value = name;
  updateRoute();
}

/* Set Drop */
function setDrop(latlng, name) {
  if (dropMarker) map.removeLayer(dropMarker);
  dropMarker = L.marker(latlng, {icon: dropIcon}).addTo(map);
  dropCoords = latlng;
  document.getElementById("drop").value = name;
  updateRoute();
}

/* PROPER PATH FINDER WITH LEAFLET ROUTING MACHINE */
function updateRoute() {
  if (!pickupCoords || !dropCoords) return;

  // Remove existing route
  if (routingControl) {
    map.removeControl(routingControl);
  }

  // Draw road path using OSRM
  routingControl = L.Routing.control({
    waypoints: [
      L.latLng(pickupCoords[0], pickupCoords[1]),
      L.latLng(dropCoords[0], dropCoords[1])
    ],
    router: L.Routing.osrmv1({
      language: 'en',
      profile: 'driving'
    }),
    lineOptions: {
      styles: [{ color: '#ffffff', opacity: 0.8, weight: 4, dashArray: '5, 10' }] // Premium dashed route line
    },
    show: false, // Hides the ugly text instructions
    addWaypoints: false,
    routeWhileDragging: false,
    fitSelectedRoutes: true,
    createMarker: function() { return null; } // Prevents routing machine from duplicating our custom markers
  }).addTo(map);

  // When route is calculated, update UI metrics
  routingControl.on('routesfound', function(e) {
    let routes = e.routes;
    let summary = routes[0].summary;
    
    // Convert meters to kilometers
    currentDistanceKm = (summary.totalDistance / 1000).toFixed(1);
    
    // Convert seconds to minutes
    let timeMin = Math.round(summary.totalTime / 60);

    if (currentDistanceKm > 100) {
      alert("Distance exceeds maximum allowed (100km).");
      return;
    }

    document.getElementById("distance").innerText = currentDistanceKm;
    document.getElementById("time").innerText = timeMin;
    updateFareUI();
  });
}

function updateFareUI() {
    let fare = (currentDistanceKm * selectedRidePrice).toFixed(0);
    document.getElementById("fare").innerText = fare;
}

/* Ride Options Selection */
document.querySelectorAll(".ride").forEach(el => {
  el.onclick = () => {
    document.querySelectorAll(".ride").forEach(r => r.classList.remove("active"));
    el.classList.add("active");
    selectedRidePrice = el.dataset.price;
    updateFareUI(); // Update fare instantly without recalculating the road route
  };
});

/* FIXED GPS */
document.getElementById("locateBtn").onclick = () => {
  if (!navigator.geolocation) {
    alert("Geolocation not supported by your browser.");
    return;
  }

  // Add a simple loading state to button
  let btn = document.getElementById("locateBtn");
  btn.style.opacity = "0.5";

  navigator.geolocation.getCurrentPosition(
    async (pos) => {
      btn.style.opacity = "1";
      let lat = pos.coords.latitude;
      let lon = pos.coords.longitude;
      let latlng = [lat, lon];
      
      map.setView(latlng, 16);
      let name = await getPlaceName(lat, lon);
      
      // Auto fill pickup with current location
      setPickup(latlng, name);
    },
    () => {
      btn.style.opacity = "1";
      alert("Location permission denied. Please enable GPS.");
    },
    { enableHighAccuracy: true }
  );
};

/* Book */
document.querySelector(".book-btn").onclick = () => {
  if (!pickupCoords || !dropCoords) {
    alert("Please select both Pickup and Drop locations to continue.");
    return;
  }
  alert(`Ride Confirmed! Driver is on the way. (Fare: ₹${(currentDistanceKm * selectedRidePrice).toFixed(0)})`);
};
