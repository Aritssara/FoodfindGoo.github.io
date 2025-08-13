let userLat, userLon;
let allPlaces = [];
let allMarkers = [];

const map = L.map('map').setView([13.7563, 100.5018], 13);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19 }).addTo(map);

function haversineDistance(lat1, lon1, lat2, lon2) {
    const toRad = deg => deg * Math.PI / 180;
    const R = 6371e3;
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a = Math.sin(dLat/2)**2 + Math.cos(toRad(lat1))*Math.cos(toRad(lat2))*Math.sin(dLon/2)**2;
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
}

async function loadRestaurants(lat, lon) {
    const radius = 1000;
    const query = `[out:json];
      node["amenity"="restaurant"](around:${radius},${lat},${lon});
      out;`;
    const url = 'https://overpass-api.de/api/interpreter?data=' + encodeURIComponent(query);
    try {
        const res = await fetch(url);
        const data = await res.json();
        allPlaces = data.elements;
        displayRestaurants("");
    } catch (err) {
        document.getElementById('list').innerHTML = "<p>เกิดข้อผิดพลาดในการโหลดข้อมูล</p>";
        console.error(err);
    }
}

function displayRestaurants(filterCuisine) {
    allMarkers.forEach(m => map.removeLayer(m));
    allMarkers = [];

    const list = document.getElementById('list');
    list.innerHTML = "";

    let count = 0;
    allPlaces.forEach(place => {
        const name = place.tags.name || "ไม่ระบุชื่อร้านอาหาร";
        const cuisine = place.tags.cuisine || "ไม่ระบุประเภทอาหาร";
        const opening = place.tags.opening_hours || "ไม่ทราบเวลาเปิด-ปิด";
        const distance = (haversineDistance(userLat, userLon, place.lat, place.lon) / 1000).toFixed(2);

        if (filterCuisine && (!place.tags.cuisine || !cuisine.includes(filterCuisine))) return;

        count++;

        const marker = L.marker([place.lat, place.lon]).addTo(map)
            .bindPopup(`<b>${name}</b><br>ประเภท: ${cuisine}<br>เวลาเปิด: ${opening}<br>ระยะทาง: ${distance} กม.`);
        allMarkers.push(marker);

        const div = document.createElement('div');
        div.className = 'place';
        div.innerHTML = `<b>${name}</b><br>ประเภทอาหาร: ${cuisine}<br>เวลาเปิด: ${opening}<br>ระยะทาง: ${distance} กม.`;
        list.appendChild(div);
    });

    list.insertAdjacentHTML("afterbegin", `<h2>พบ ${count} ร้าน</h2>`);
}

function success(position) {
    userLat = position.coords.latitude;
    userLon = position.coords.longitude;
    map.setView([userLat, userLon], 15);
    L.marker([userLat, userLon]).addTo(map).bindPopup("ตำแหน่งของคุณ").openPopup();
    loadRestaurants(userLat, userLon);
}

function error() {
    document.getElementById('list').innerHTML = "<p>ไม่สามารถระบุตำแหน่งของคุณได้</p>";
}

navigator.geolocation.getCurrentPosition(success, error);

document.getElementById('filter').addEventListener('change', e => {
    displayRestaurants(e.target.value);
});