async function loadMenus() {
  const res = await fetch('/api/menus');
  const menus = await res.json();
  const menuList = document.getElementById('menuList');
  menuList.innerHTML = '';

  menus.forEach(menu => {
    const li = document.createElement('li');
    li.className = 'card';
    li.innerHTML = `
      <img src="${menu.image}" alt="${menu.name}">
      <h3>${menu.name}</h3>
      <p>${menu.description}</p>
      <button onclick="viewMenuDetails('${menu.name}')">ดูรายละเอียด.</button>
    `;
    menuList.appendChild(li);
  });
}

window.viewMenuDetails = function(menuName) {
  window.location.href = `/Menu/detail.html?menu=${encodeURIComponent(menuName)}`;
}

window.addEventListener('DOMContentLoaded', loadMenus);
