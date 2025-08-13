const params = new URLSearchParams(window.location.search);
    const menuName = params.get('menu');
    document.getElementById('menuName').textContent = menuName || '';

    if (!menuName) {
      alert('ไม่พบชื่อเมนู');
      window.location.href = '/Menu/menu.html';
    }

    let map, userMarker, routeLayer;

    async function loadRestaurantsByMenu(menu) {
      const res = await fetch(`/api/restaurants/by-menu?menu=${encodeURIComponent(menu)}`);
      const restaurants = await res.json();

      const container = document.getElementById('restaurantList');
      container.innerHTML = '';

      if (restaurants.length === 0) {
        container.textContent = 'ไม่พบร้านที่มีเมนูนี้';
        return;
      }

      restaurants.forEach(r => {
        const div = document.createElement('div');
        div.className = 'restaurant-item';
        div.textContent = `${r.name} (พิกัด: ${r.location.coordinates[1].toFixed(5)}, ${r.location.coordinates[0].toFixed(5)})`;
        div.onclick = () => showRouteTo(r);
        container.appendChild(div);
      });
    }

    async function showRouteTo(restaurant) {
      if (!map) {
        map = L.map('map').setView([restaurant.location.coordinates[1], restaurant.location.coordinates[0]], 15);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
          attribution: '© OpenStreetMap contributors'
        }).addTo(map);
      }

      if (routeLayer) map.removeControl(routeLayer);
      if (userMarker) map.removeLayer(userMarker);

      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const userLatLng = [pos.coords.latitude, pos.coords.longitude];
          userMarker = L.marker(userLatLng).addTo(map).bindPopup('ตำแหน่งของคุณ').openPopup();

          if (!window.L.Routing) {
            const script = document.createElement('script');
            script.src = 'https://unpkg.com/leaflet-routing-machine@3.2.12/dist/leaflet-routing-machine.min.js';
            script.onload = () => createRoute(userLatLng, [restaurant.location.coordinates[1], restaurant.location.coordinates[0]]);
            document.head.appendChild(script);

            const css = document.createElement('link');
            css.rel = 'stylesheet';
            css.href = 'https://unpkg.com/leaflet-routing-machine@3.2.12/dist/leaflet-routing-machine.css';
            document.head.appendChild(css);
          } else {
            createRoute(userLatLng, [restaurant.location.coordinates[1], restaurant.location.coordinates[0]]);
          }
        },
        (err) => {
          alert('ไม่สามารถรับตำแหน่งของคุณได้');
          map.setView([restaurant.location.coordinates[1], restaurant.location.coordinates[0]], 15);
          L.marker([restaurant.location.coordinates[1], restaurant.location.coordinates[0]])
            .addTo(map)
            .bindPopup(restaurant.name)
            .openPopup();
        }
      );
    }

    function createRoute(start, end) {
      routeLayer = L.Routing.control({
        waypoints: [
          L.latLng(start[0], start[1]),
          L.latLng(end[0], end[1])
        ],
        routeWhileDragging: false,
        show: false,
        addWaypoints: false,
      }).addTo(map);
      map.fitBounds(L.latLngBounds(start, end));
    }

    window.addEventListener('DOMContentLoaded', () => {
      if (menuName) {
        loadRestaurantsByMenu(menuName);
      }
    });