fetch("/nav.html")
  .then((res) => res.text())
  .then((data) => {
    const navbar = document.getElementById("navbar");
    navbar.innerHTML = data;

    // หา toggle และ menu จากใน navbar ไม่ใช่จาก document ทั้งหน้า
    const toggle = navbar.querySelector(".menu-toggle");
    const menu = navbar.querySelector(".menu");

    if (toggle && menu) {
      toggle.addEventListener("click", () => {
        menu.classList.toggle("active");
      });
    } else {
      console.warn("ไม่เจอ .menu-toggle หรือ .menu");
    }
  });
fetch('http://localhost:5000/api/menus/menus') // เปลี่ยน URL ตามจริง
  .then(res => res.json())
  .then(menus => {
    const container = document.getElementById('menu-list');
    menus.forEach(menu => {
      const div = document.createElement('div');
      div.className = 'content-item';
      div.innerHTML = `
        <img src="${menu.image}" alt="${menu.name}" />
        <h4>${menu.name}</h4>
        <p>${menu.review || "ยังไม่มีรีวิว"}</p>
        <a href="/menu/detail.html?id=${menu._id}" class="content-btn">ดูรายการอาหาร</a>
      `;
      container.appendChild(div);
    });
  })
  .catch(err => {
    console.error("โหลดเมนูไม่สำเร็จ", err);
  });