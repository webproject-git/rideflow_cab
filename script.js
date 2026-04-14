let map = L.map('map').setView([28.6139, 77.2090], 13);

L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  maxZoom: 19
}).addTo(map);

let pickupMarker = null;
let dropMarker = null;
let routeLine = null;

let pickupCoords = null;
let dropCoords = null;

let selectingMode = false;
let step = 0;

let selectedRidePrice = 10;

/* Reverse Geocode */
async function getPlaceName(lat, lon) {
  try {
    let res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}`);
    let data = await res.json();
    return data.display_name || "Selected Location";
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

      places.slice(0, 5).forEach(place => {
        let div = document.createElement("div");
        div.innerText = place.display_name;

        div.onclick = () => {
          input.value = place.display_name;
          box.innerHTML = "";

          let latlng = [parseFloat(place.lat), parseFloat(place.lon)];

          if (isPickup) setPickup(latlng, place.display_name);
          else setDrop(latlng, place.display_name);

          map.flyTo(latlng, 15);
        };

        box.appendChild(div);
      });
    }, 400);
  });

  /* Close suggestions on click outside */
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
  alert("Tap map: First Pickup, then Drop");
};

/* Map Click */
map.on('click', async function(e) {
  if (!selectingMode) return;

  let latlng = [e.latlng.lat, e.latlng.lng];
  let name = await getPlaceName(latlng[0], latlng[1]);

  if (step === 1) {
    setPickup(latlng, name);
    step = 2;
  } else if (step === 2) {
    setDrop(latlng, name);
    selectingMode = false;
    step = 0;
  }
});

/* Set Pickup */
function setPickup(latlng, name) {
  if (pickupMarker) map.removeLayer(pickupMarker);
  pickupMarker = L.marker(latlng).addTo(map);
  pickupCoords = latlng;
  document.getElementById("pickup").value = name;
  updateRoute();
}

/* Set Drop */
function setDrop(latlng, name) {
  if (dropMarker) map.removeLayer(dropMarker);
  dropMarker = L.marker(latlng).addTo(map);
  dropCoords = latlng;
  document.getElementById("drop").value = name;
  updateRoute();
}

/* Distance + Route */
function updateRoute() {
  if (!pickupCoords || !dropCoords) return;

  if (routeLine) map.removeLayer(routeLine);

  routeLine = L.polyline([pickupCoords, dropCoords], { color: 'cyan' }).addTo(map);

  let distance = map.distance(pickupCoords, dropCoords) / 1000;

  if (distance > 75) {
    alert("Max distance 75 km");
    return;
  }

  document.getElementById("distance").innerText = distance.toFixed(2);
  document.getElementById("fare").innerText = (distance * selectedRidePrice).toFixed(0);
}

/* Ride */
document.querySelectorAll(".ride").forEach(el => {
  el.onclick = () => {
    document.querySelectorAll(".ride").forEach(r => r.classList.remove("active"));
    el.classList.add("active");
    selectedRidePrice = el.dataset.price;
    updateRoute();
  };
});

/* FIXED GPS */
document.getElementById("locateBtn").onclick = () => {
  if (!navigator.geolocation) {
    alert("Geolocation not supported");
    return;
  }

  navigator.geolocation.getCurrentPosition(
    async (pos) => {
      let lat = pos.coords.latitude;
      let lon = pos.coords.longitude;

      let latlng = [lat, lon];
      map.setView(latlng, 16);

      let name = await getPlaceName(lat, lon);
      setPickup(latlng, name);
    },
    () => {
      alert("Location permission denied");
    },
    { enableHighAccuracy: true }
  );
};

/* Book */
document.querySelector(".book-btn").onclick = () => {
  if (!pickupCoords || !dropCoords) {
    alert("Select both locations");
    return;
  }

  alert("Ride booked successfully");
};