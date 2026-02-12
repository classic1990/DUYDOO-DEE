// CONFIG
const API_URL =
  window.location.hostname === "localhost" ||
  window.location.hostname === "127.0.0.1"
    ? "http://localhost:5000/api"
    : "/api";
let allMovies = [];
let allUsers = [];
let currentMoviePage = 1;
let moviesPerPage = 10;
let currentSort = { col: "title", dir: "asc" };
let currentSearchTerm = "";
let isEditing = false;
let batchTempData = []; // เก็บข้อมูลชั่วคราวสำหรับ Batch Import
let userChartInstance = null;
let roleChartInstance = null;

// Global Token Variables
const getToken = () =>
  localStorage.getItem("accessToken") || sessionStorage.getItem("accessToken");
const getRole = () =>
  localStorage.getItem("userRole") || sessionStorage.getItem("userRole");

document.addEventListener("DOMContentLoaded", () => {
  // ตรวจสอบว่าเป็นหน้า Admin หรือไม่ (เช็คจาก Element ที่มีเฉพาะในหน้า Admin)
  if (document.getElementById("adminTableBody")) {
    initAdminPage();
  }
});

// --- SECURE FETCH (Auto Refresh Token) ---
async function secureFetch(url, options = {}) {
  let token = getToken();
  let headers = { ...options.headers, "Content-Type": "application/json" };

  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  let res = await fetch(url, { ...options, headers });

  if (res.status === 401) {
    // Token หมดอายุ -> พยายาม Refresh
    try {
      const refreshRes = await fetch(`${API_URL}/refresh-token`, {
        method: "POST",
      });
      if (refreshRes.ok) {
        const data = await refreshRes.json();
        if (data.accessToken) {
          // บันทึก Token ใหม่ลงที่เดิม (Local หรือ Session)
          if (localStorage.getItem("accessToken"))
            localStorage.setItem("accessToken", data.accessToken);
          else sessionStorage.setItem("accessToken", data.accessToken);

          // Retry Request
          headers["Authorization"] = `Bearer ${data.accessToken}`;
          res = await fetch(url, { ...options, headers });
          if (res.status !== 401) return res;
        }
      }
    } catch (err) {
      console.error("Refresh failed", err);
    }

    // ถ้า Refresh ไม่ผ่าน
    showToast("เซสชั่นหมดอายุ กรุณาเข้าสู่ระบบใหม่", "error");
    logout();
    throw new Error("Unauthorized");
  }
  return res;
}

// --- ADMIN PAGE INITIALIZATION ---
function initAdminPage() {
  // 1. Security Check
  if (!getToken() || getRole() !== "admin") {
    showToast("เฉพาะแอดมินเท่านั้นที่เข้าถึงหน้านี้ได้", "error");
    window.location.href = "index.html"; // Redirect to main page to prevent login loop
    return;
  }

  // 3. Display Admin Name
  const adminNameDisplay = document.getElementById("adminNameDisplay");
  if (adminNameDisplay)
    adminNameDisplay.innerText =
      localStorage.getItem("username") ||
      sessionStorage.getItem("username") ||
      "Admin";

  // 4. Load Initial Data
  loadMovies();

  // 5. Attach Event Listeners
  const movieForm = document.getElementById("movieForm");
  if (movieForm) {
    movieForm.onsubmit = async (e) => {
      e.preventDefault();
      // ใช้ Base64 ถ้ามีค่า (จากการอัปโหลด) ถ้าไม่มีให้ใช้ URL ปกติ
      const finalPoster =
        document.getElementById("posterBase64").value ||
        document.getElementById("posterUrl").value;

      const data = {
        title: document.getElementById("title").value,
        posterUrl: finalPoster,
        year: document.getElementById("year").value,
        rating: document.getElementById("rating").value,
        ytId: document.getElementById("ytId").value,
        actors: document.getElementById("actors").value,
        category: document.getElementById("category").value,
        totalEpisodes: document.getElementById("totalEpisodes").value,
        isVip: document.getElementById("isVip").checked,
        description: document.getElementById("description").value,
      };

      const id = document.getElementById("movieId").value;
      try {
        await secureFetch(
          isEditing ? `${API_URL}/movies/${id}` : `${API_URL}/movies`,
          {
            method: id ? "PUT" : "POST",
            body: JSON.stringify(data),
          },
        );
        closeModal();
        loadMovies();
        showToast("บันทึกข้อมูลสำเร็จ", "success");
      } catch (err) {
        showToast("เกิดข้อผิดพลาดในการบันทึก", "error");
      }
    };
  }

  const announcementForm = document.getElementById("announcementForm");
  if (announcementForm) {
    announcementForm.onsubmit = async (e) => {
      e.preventDefault();
      const text = document.getElementById("annText").value;
      const isActive = document.getElementById("annActive").checked;
      const color = document.querySelector(
        'input[name="annColor"]:checked',
      ).value;
      try {
        const res = await secureFetch(`${API_URL}/announcement`, {
          method: "POST",
          body: JSON.stringify({ text, isActive, color }),
        });
        const json = await res.json();
        if (json.success) showToast("บันทึกประกาศเรียบร้อย", "success");
        else showToast(json.message, "error");
      } catch (err) {
        showToast("เกิดข้อผิดพลาด", "error");
      }
    };
  }

  const userRoleForm = document.getElementById("userRoleForm");
  if (userRoleForm) {
    userRoleForm.onsubmit = async (e) => {
      e.preventDefault();
      const id = document.getElementById("editUserId").value;
      const role = document.getElementById("editUserRole").value;
      const vipExpiresAt = document.getElementById("editVipExpire").value;

      try {
        const res = await secureFetch(`${API_URL}/users/${id}`, {
          method: "PUT",
          body: JSON.stringify({ role, vipExpiresAt }),
        });
        const json = await res.json();
        if (json.success) {
          closeUserRoleModal();
          loadUsers();
          showToast("แก้ไขสิทธิ์ผู้ใช้งานสำเร็จ", "success");
        } else {
          showToast(json.message, "error");
        }
      } catch (err) {
        showToast("เกิดข้อผิดพลาด", "error");
      }
    };
  }

  const passwordForm = document.getElementById("passwordForm");
  if (passwordForm) {
    passwordForm.onsubmit = async (e) => {
      e.preventDefault();
      const oldPassword = document.getElementById("oldPass").value;
      const newPassword = document.getElementById("newPass").value;
      try {
        const res = await secureFetch(`${API_URL}/change-password`, {
          method: "PUT",
          body: JSON.stringify({ oldPassword, newPassword }),
        });
        const json = await res.json();
        if (json.success) {
          showToast("เปลี่ยนรหัสผ่านสำเร็จ กรุณาเข้าสู่ระบบใหม่", "success");
          logout();
        } else {
          showToast(json.message, "error");
        }
      } catch (err) {
        showToast("เกิดข้อผิดพลาดในการเชื่อมต่อ", "error");
      }
    };
  }
}

// --- HELPER FUNCTIONS ---
async function logout() {
  if (confirm("ยืนยันการออกจากระบบ?")) {
    try {
      await fetch(`${API_URL}/logout`, { method: "POST" });
    } catch (e) {
      console.error("Logout API failed", e);
    }
    localStorage.clear();
    sessionStorage.clear();
    window.location.href = "login.html";
  }
}

function showToast(message, type = "info") {
  const container = document.getElementById("toastContainer");
  if (!container) return alert(message); // Fallback

  const toast = document.createElement("div");
  toast.className = `toast ${type}`;

  let icon = "fa-info-circle";
  if (type === "success") icon = "fa-check-circle text-emerald-400";
  if (type === "error") icon = "fa-exclamation-circle text-red-400";

  toast.innerHTML = `<i class="fa-solid ${icon} text-lg"></i> <span class="font-medium text-sm">${message}</span>`;
  container.appendChild(toast);

  requestAnimationFrame(() => toast.classList.add("show"));
  setTimeout(() => {
    toast.classList.remove("show");
    setTimeout(() => toast.remove(), 400);
  }, 3000);
}

// --- MOVIE MANAGEMENT ---
async function loadMovies() {
  try {
    renderSkeleton();
    const res = await secureFetch(`${API_URL}/movies`);
    if (res.status === 403) {
      showToast("คุณไม่มีสิทธิ์เข้าถึง", "error");
      localStorage.clear();
      window.location.href = "login.html";
      return;
    }
    const json = await res.json();
    allMovies = json.data;
    renderMovieTable();
    updateStats(allMovies);
  } catch (err) {
    showToast("เชื่อมต่อ Server ไม่ได้", "error");
  }
}

function renderSkeleton() {
  const tbody = document.getElementById("adminTableBody");
  tbody.innerHTML = Array(5)
    .fill(0)
    .map(
      () => `
        <tr class="skeleton border-b border-slate-800/50">
            <td class="p-4"><div class="w-10 h-14 bg-slate-800/50 rounded"></div></td>
            <td class="p-4"><div class="h-4 bg-slate-800/50 rounded w-3/4 mb-2"></div><div class="h-3 bg-slate-800/50 rounded w-1/2"></div></td>
            <td class="p-4"><div class="h-6 bg-slate-800/50 rounded w-16"></div></td>
            <td class="p-4"><div class="h-6 bg-slate-800/50 rounded w-12"></div></td>
            <td class="p-4 text-right"><div class="h-8 bg-slate-800/50 rounded w-20 ml-auto"></div></td>
        </tr>
    `,
    )
    .join("");
}

function renderMovieTable() {
  // 1. Filter
  let temp = allMovies.filter((m) =>
    m.title.toLowerCase().includes(currentSearchTerm),
  );

  // 2. Sort
  temp.sort((a, b) => {
    let valA = a[currentSort.col];
    let valB = b[currentSort.col];

    if (valA === undefined) valA = "";
    if (valB === undefined) valB = "";

    if (typeof valA === "string") valA = valA.toLowerCase();
    if (typeof valB === "string") valB = valB.toLowerCase();

    if (valA < valB) return currentSort.dir === "asc" ? -1 : 1;
    if (valA > valB) return currentSort.dir === "asc" ? 1 : -1;
    return 0;
  });

  // 3. Paginate
  const totalPages = Math.ceil(temp.length / moviesPerPage);
  if (currentMoviePage > totalPages) currentMoviePage = totalPages || 1;
  if (currentMoviePage < 1) currentMoviePage = 1;

  const start = (currentMoviePage - 1) * moviesPerPage;
  const end = start + moviesPerPage;
  const sliced = temp.slice(start, end);

  // 4. Render Rows
  renderMovies(sliced);

  // 5. Render Pagination
  renderPagination(totalPages);

  // 6. Update Sort Icons
  updateSortIcons();
}

function renderMovies(movies) {
  document.getElementById("adminTableBody").innerHTML = movies
    .map(
      (m) => `
        <tr class="hover:bg-slate-900/50 transition group">
            <td class="p-4">
                <div class="poster-wrapper relative w-10 h-14">
                    <img src="${m.posterUrl}" class="w-full h-full object-cover rounded bg-slate-800 cursor-help" onerror="this.src='https://placehold.co/100x150'">
                    <div class="poster-popup hidden absolute z-50 left-14 top-1/2 -translate-y-1/2 w-48 rounded-xl shadow-2xl border-2 border-sky-500 overflow-hidden bg-slate-900 pointer-events-none">
                        <img src="${m.posterUrl}" class="w-full h-auto object-cover">
                    </div>
                </div>
            </td>
            <td class="p-4 font-bold text-white">${m.title}</td>
            <td class="p-4"><span class="bg-slate-800 px-2 py-1 rounded text-xs text-slate-300">${m.category}</span></td>
            <td class="p-4">${m.isVip ? '<span class="text-yellow-500 font-bold text-xs">VIP</span>' : '<span class="text-slate-500 text-xs">FREE</span>'}</td>
            <td class="p-4 text-right">
                <button onclick="editMovie('${m._id}')" class="text-sky-500 hover:text-sky-400 mr-2"><i class="fa-solid fa-pen-to-square"></i></button>
                <button onclick="deleteMovie('${m._id}')" class="text-red-500 hover:text-red-400"><i class="fa-solid fa-trash"></i></button>
            </td>
        </tr>
    `,
    )
    .join("");
}

function updateStats(movies) {
  document.getElementById("statTotal").innerText = movies.length;
  document.getElementById("statVip").innerText = movies.filter(
    (m) => m.isVip,
  ).length;
}

function renderPagination(totalPages) {
  const container = document.getElementById("moviePagination");
  if (totalPages <= 1) {
    container.innerHTML = "";
    return;
  }

  let html = "";
  // Prev
  html += `<button onclick="changeMoviePage(${currentMoviePage - 1})" class="w-8 h-8 rounded bg-slate-800 hover:bg-sky-600 text-white transition flex items-center justify-center ${currentMoviePage === 1 ? "opacity-50 cursor-not-allowed pointer-events-none" : ""}"><i class="fa-solid fa-chevron-left"></i></button>`;

  // Page Numbers
  let startPage = Math.max(1, currentMoviePage - 2);
  let endPage = Math.min(totalPages, startPage + 4);
  if (endPage - startPage < 4) startPage = Math.max(1, endPage - 4);

  for (let i = startPage; i <= endPage; i++) {
    const active =
      i === currentMoviePage
        ? "bg-sky-600 text-white shadow-lg shadow-sky-900/50"
        : "bg-slate-800 text-slate-400 hover:bg-slate-700 hover:text-white";
    html += `<button onclick="changeMoviePage(${i})" class="w-8 h-8 rounded font-bold transition flex items-center justify-center ${active}">${i}</button>`;
  }

  // Next
  html += `<button onclick="changeMoviePage(${currentMoviePage + 1})" class="w-8 h-8 rounded bg-slate-800 hover:bg-sky-600 text-white transition flex items-center justify-center ${currentMoviePage === totalPages ? "opacity-50 cursor-not-allowed pointer-events-none" : ""}"><i class="fa-solid fa-chevron-right"></i></button>`;

  container.innerHTML = html;
}

window.changeMoviePage = (p) => {
  currentMoviePage = p;
  renderMovieTable();
};

window.changeItemsPerPage = (val) => {
  moviesPerPage = parseInt(val);
  currentMoviePage = 1;
  renderMovieTable();
};

window.sortMovies = (col) => {
  if (currentSort.col === col) {
    currentSort.dir = currentSort.dir === "asc" ? "desc" : "asc";
  } else {
    currentSort.col = col;
    currentSort.dir = "asc";
  }
  renderMovieTable();
};

function updateSortIcons() {
  ["title", "category", "isVip"].forEach((col) => {
    const icon = document.getElementById(`sort-${col}`);
    if (icon) {
      icon.className =
        currentSort.col === col
          ? `fa-solid ml-1 text-sky-500 fa-sort-${currentSort.dir === "asc" ? "up" : "down"}`
          : "fa-solid fa-sort ml-1 text-slate-600";
    }
  });
}

window.exportMoviesCSV = () => {
  if (!allMovies || allMovies.length === 0)
    return alert("ไม่มีข้อมูลให้ส่งออก");

  const headers = [
    "ID",
    "Title",
    "Category",
    "Year",
    "Rating",
    "YouTube ID",
    "Poster URL",
    "VIP",
    "Episodes",
    "Actors",
    "Description",
  ];
  const csvRows = [headers.join(",")];

  for (const m of allMovies) {
    const row = [
      m._id,
      `"${(m.title || "").replace(/"/g, '""')}"`,
      m.category,
      m.year,
      m.rating,
      m.ytId,
      `"${(m.posterUrl || "").replace(/"/g, '""')}"`,
      m.isVip ? "Yes" : "No",
      m.totalEpisodes || 1,
      `"${(m.actors || "").replace(/"/g, '""')}"`,
      `"${(m.description || "").replace(/"/g, '""').replace(/\n/g, " ")}"`,
    ];
    csvRows.push(row.join(","));
  }

  const blob = new Blob(["\uFEFF" + csvRows.join("\n")], {
    type: "text/csv;charset=utf-8;",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `movies_export_${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
};

function searchAdmin() {
  currentSearchTerm = document
    .getElementById("adminSearch")
    .value.toLowerCase();
  currentMoviePage = 1;
  renderMovieTable();
}

async function fetchAiData() {
  const btn = document.getElementById("aiBtn");
  const url = document.getElementById("aiUrl").value;
  const vid = url.match(/(?:v=|\/)([0-9A-Za-z_-]{11})/)?.[1] || url;

  if (!vid) return showToast("กรุณาใส่ลิงก์ YouTube ที่ถูกต้อง", "error");

  btn.disabled = true;
  btn.innerHTML =
    '<i class="fa-solid fa-circle-notch fa-spin"></i> AI กำลังทำงาน...';

  try {
    const res = await fetch(`${API_URL}/fetch-movie-data`, {
      method: "POST",
      body: JSON.stringify({ videoId: vid }),
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${getToken()}`,
      },
    });
    const json = await res.json();

    if (json.success) {
      const d = json.data;
      document.getElementById("title").value = d.title;
      document.getElementById("year").value = d.year;
      document.getElementById("rating").value = d.rating;
      document.getElementById("ytId").value = d.ytId;
      document.getElementById("posterUrl").value = d.posterUrl;
      document.getElementById("actors").value = d.actors || "";
      document.getElementById("description").value =
        (d.description || "") + (d.lessons ? `\n\nข้อคิด: ${d.lessons}` : "");

      if (d.category) {
        const catSelect = document.getElementById("category");
        const map = { china: "china", inter: "inter", anime: "anime" };
        if (map[d.category.toLowerCase()])
          catSelect.value = map[d.category.toLowerCase()];
      }
      updatePreview();
    } else {
      showToast(json.message || "AI ไม่สามารถดึงข้อมูลได้", "error");
    }
  } catch (err) {
    console.error(err);
    showToast("เกิดข้อผิดพลาดในการเชื่อมต่อ", "error");
  }

  btn.disabled = false;
  btn.innerHTML = '<i class="fa-solid fa-robot"></i> ดึงข้อมูล AI';
}

window.checkAiKeys = async () => {
  showToast("กำลังตรวจสอบสถานะ API Keys...", "info");

  try {
    const res = await secureFetch(`${API_URL}/admin/check-keys`);
    const json = await res.json();

    if (json.success) {
      // สร้าง Modal HTML แบบ Dynamic
      let html = `<div class="fixed inset-0 bg-black/90 flex items-center justify-center z-[200] p-4 animate-fade-in" id="keysModal" onclick="if(event.target.id==='keysModal') this.remove()">
              <div class="glass max-w-2xl w-full p-6 rounded-2xl relative border border-slate-700 shadow-2xl">
                  <h3 class="text-xl font-bold text-white mb-6 flex items-center gap-2"><i class="fa-solid fa-key text-yellow-500"></i> สถานะ API Keys (${json.data.length})</h3>
                  <button onclick="document.getElementById('keysModal').remove()" class="absolute top-4 right-4 text-slate-400 hover:text-white transition"><i class="fa-solid fa-times text-xl"></i></button>
                  <div class="space-y-3 max-h-[60vh] overflow-y-auto custom-scrollbar pr-2">`;

      json.data.forEach((k, i) => {
        let color = "text-emerald-400 border-emerald-500/20 bg-emerald-500/5";
        let icon = "fa-check-circle";
        if (k.status === "quota") {
          color = "text-orange-400 border-orange-500/20 bg-orange-500/5";
          icon = "fa-exclamation-triangle";
        }
        if (k.status === "invalid" || k.status === "error") {
          color = "text-red-400 border-red-500/20 bg-red-500/5";
          icon = "fa-times-circle";
        }

        html += `<div class="flex items-center justify-between p-4 rounded-xl border ${color} transition hover:bg-slate-800/50">
                  <div class="flex items-center gap-4">
                      <span class="text-slate-500 font-mono text-xs bg-slate-900 px-2 py-1 rounded">KEY #${i + 1}</span>
                      <span class="font-mono font-bold tracking-wider">${k.key}</span>
                  </div>
                  <div class="flex items-center gap-2 text-sm font-bold">
                      <i class="fa-solid ${icon}"></i> ${k.message}
                  </div>
              </div>`;
      });

      html += `</div></div></div>`;
      document.body.insertAdjacentHTML("beforeend", html);
    }
  } catch (err) {
    showToast("เกิดข้อผิดพลาดในการตรวจสอบ", "error");
  }
};

// --- UI HELPERS ---
function openModal() {
  isEditing = false;
  document.getElementById("movieModal").classList.remove("hidden");
  document.getElementById("movieForm").reset();
  document.getElementById("movieId").value = "";
  document.getElementById("posterBase64").value = ""; // Reset Base64
  document.getElementById("modalTitle").innerHTML =
    '<i class="fa-solid fa-circle-plus text-sky-500"></i> เพิ่มข้อมูลซีรีส์';
  document.getElementById("posterPreview").classList.add("hidden");
  document.getElementById("posterPlaceholder").classList.remove("hidden");
  togglePosterMode("url"); // Reset to URL mode
}
function closeModal() {
  document.getElementById("movieModal").classList.add("hidden");
}
function updatePreview() {
  // เช็คทั้ง URL และ Base64 (Base64 จะถูกเซ็ตลง hidden input เมื่ออัปโหลด)
  const url = document.getElementById("posterUrl").value;
  const base64 = document.getElementById("posterBase64").value;
  const finalSrc = base64 || url;

  const img = document.getElementById("posterPreview");
  const placeholder = document.getElementById("posterPlaceholder");

  if (finalSrc) {
    img.src = finalSrc;
    img.classList.remove("hidden");
    placeholder.classList.add("hidden");
  } else {
    img.classList.add("hidden");
    placeholder.classList.remove("hidden");
  }
}

// --- FILE UPLOAD HANDLERS ---
window.togglePosterMode = (mode) => {
  const urlInput = document.getElementById("posterUrl");
  const fileInput = document.getElementById("posterFile");
  const btnUrl = document.getElementById("btnModeUrl");
  const btnFile = document.getElementById("btnModeFile");

  if (mode === "url") {
    urlInput.classList.remove("hidden");
    fileInput.classList.add("hidden");
    btnUrl.className = "text-sky-400 font-bold underline";
    btnFile.className = "text-slate-500 hover:text-white";
    // Clear file input if switching back to URL to avoid confusion
    fileInput.value = "";
    document.getElementById("posterBase64").value = "";
  } else {
    urlInput.classList.add("hidden");
    fileInput.classList.remove("hidden");
    btnFile.className = "text-sky-400 font-bold underline";
    btnUrl.className = "text-slate-500 hover:text-white";
    // Clear URL input
    urlInput.value = "";
  }
  updatePreview();
};

window.handleFileUpload = (input) => {
  const file = input.files[0];
  if (file) {
    const reader = new FileReader();
    reader.onload = (e) => {
      const base64 = e.target.result;
      document.getElementById("posterBase64").value = base64;
      updatePreview(); // Show preview immediately
    };
    reader.readAsDataURL(file);
  } else {
    document.getElementById("posterBase64").value = "";
    updatePreview();
  }
};

function editMovie(id) {
  isEditing = true;
  const m = allMovies.find((i) => i._id === id);
  document.getElementById("movieId").value = m._id;
  document.getElementById("title").value = m.title;
  document.getElementById("year").value = m.year;
  document.getElementById("rating").value = m.rating;
  document.getElementById("ytId").value = m.ytId;

  // Check if poster is Base64 or URL
  if (m.posterUrl && m.posterUrl.startsWith("data:image")) {
    togglePosterMode("file");
    document.getElementById("posterBase64").value = m.posterUrl;
    document.getElementById("posterUrl").value = "";
  } else {
    togglePosterMode("url");
    document.getElementById("posterUrl").value = m.posterUrl;
    document.getElementById("posterBase64").value = "";
  }

  document.getElementById("category").value = m.category;
  document.getElementById("totalEpisodes").value = m.totalEpisodes || 1;
  document.getElementById("actors").value = m.actors || "";
  document.getElementById("description").value = m.description || "";
  document.getElementById("isVip").checked = m.isVip;
  document.getElementById("modalTitle").innerHTML =
    '<i class="fa-solid fa-pen-to-square text-sky-500"></i> แก้ไขข้อมูลซีรีส์';
  updatePreview();
  document.getElementById("movieModal").classList.remove("hidden");
}

async function deleteMovie(id) {
  if (confirm("ต้องการลบซีรีส์เรื่องนี้จริงหรือไม่?")) {
    await secureFetch(`${API_URL}/movies/${id}`, { method: "DELETE" });
    await loadMovies();
  }
}

window.toggleMobileMenu = () => {
  const nav = document.getElementById("sideNav");
  if (nav) nav.classList.toggle("hidden");
};

// --- SECTION NAVIGATION ---
function showSection(section) {
  document
    .getElementById("moviesSection")
    .classList.toggle("hidden", section !== "movies");
  document
    .getElementById("analyticsSection")
    .classList.toggle("hidden", section !== "analytics");
  document
    .getElementById("usersSection")
    .classList.toggle("hidden", section !== "users");
  document
    .getElementById("announcementSection")
    .classList.toggle("hidden", section !== "announcement");

  const navMovies = document.getElementById("nav-movies");
  const navAnalytics = document.getElementById("nav-analytics");
  const navUsers = document.getElementById("nav-users");
  const navAnn = document.getElementById("nav-announcement");

  const activeClass =
    "bg-sky-600 text-white font-bold shadow-lg shadow-sky-900/20".split(" ");
  const inactiveClass = "text-slate-400 hover:bg-slate-900".split(" ");

  [navMovies, navAnalytics, navUsers, navAnn].forEach((nav) => {
    nav.classList.remove(...activeClass);
    nav.classList.add(...inactiveClass);
  });

  if (section === "movies") {
    navMovies.classList.add(...activeClass);
    navMovies.classList.remove(...inactiveClass);
  } else if (section === "analytics") {
    navAnalytics.classList.add(...activeClass);
    navAnalytics.classList.remove(...inactiveClass);
    loadAnalytics();
  } else if (section === "users") {
    navUsers.classList.add(...activeClass);
    navUsers.classList.remove(...inactiveClass);
    loadUsers();
  } else if (section === "announcement") {
    navAnn.classList.add(...activeClass);
    navAnn.classList.remove(...inactiveClass);
    loadAnnouncement();
  }
}

async function loadAnalytics() {
  // ถ้ายังไม่มีข้อมูล User ให้โหลดมาก่อน
  if (allUsers.length === 0) {
    try {
      const res = await secureFetch(`${API_URL}/users`);
      const json = await res.json();
      if (json.success) {
        allUsers = json.data;
      }
    } catch (err) {
      console.error(err);
      return;
    }
  }

  // 1. กราฟผู้ใช้งานใหม่ 7 วันย้อนหลัง
  const last7Days = [...Array(7)]
    .map((_, i) => {
      const d = new Date();
      d.setDate(d.getDate() - i);
      return d.toISOString().split("T")[0];
    })
    .reverse();

  const userCounts = last7Days.map((date) => {
    return allUsers.filter((u) => {
      if (!u.createdAt) return false;
      // รองรับทั้ง Firestore Timestamp object และ ISO String
      const cDate = new Date(
        u.createdAt._seconds ? u.createdAt._seconds * 1000 : u.createdAt,
      );
      return cDate.toISOString().split("T")[0] === date;
    }).length;
  });

  const ctxUser = document.getElementById("userChart").getContext("2d");
  if (userChartInstance) userChartInstance.destroy();

  userChartInstance = new Chart(ctxUser, {
    type: "line",
    data: {
      labels: last7Days,
      datasets: [
        {
          label: "ผู้ใช้งานใหม่",
          data: userCounts,
          borderColor: "#0ea5e9",
          backgroundColor: "rgba(14, 165, 233, 0.2)",
          tension: 0.4,
          fill: true,
        },
      ],
    },
    options: {
      responsive: true,
      plugins: {
        legend: { labels: { color: "white" } },
      },
      scales: {
        y: {
          ticks: { color: "#94a3b8" },
          grid: { color: "#334155" },
          beginAtZero: true,
        },
        x: { ticks: { color: "#94a3b8" }, grid: { color: "#334155" } },
      },
    },
  });

  // 2. กราฟสัดส่วนสมาชิก
  const vipCount = allUsers.filter((u) => u.role === "vip").length;
  const userCount = allUsers.filter((u) => u.role === "user").length;
  const adminCount = allUsers.filter((u) => u.role === "admin").length;

  const ctxRole = document.getElementById("roleChart").getContext("2d");
  if (roleChartInstance) roleChartInstance.destroy();

  roleChartInstance = new Chart(ctxRole, {
    type: "doughnut",
    data: {
      labels: ["VIP", "User", "Admin"],
      datasets: [
        {
          data: [vipCount, userCount, adminCount],
          backgroundColor: ["#eab308", "#64748b", "#0ea5e9"],
          borderWidth: 0,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { position: "bottom", labels: { color: "white" } },
      },
    },
  });
}

// --- USER MANAGEMENT ---
async function loadUsers() {
  try {
    const res = await secureFetch(`${API_URL}/users`);
    const json = await res.json();
    if (json.success) {
      allUsers = json.data;
      renderUsers(allUsers);
    }
  } catch (err) {
    showToast("โหลดข้อมูลผู้ใช้ไม่สำเร็จ", "error");
  }
}

function renderUsers(users) {
  document.getElementById("usersTableBody").innerHTML = users
    .map((u) => {
      const isMainAdmin = u.username === "admin";
      let vipStatus = "";
      if (u.role === "vip" && u.vipExpiresAt) {
        const daysLeft = Math.ceil(
          (new Date(u.vipExpiresAt) - new Date()) / (1000 * 60 * 60 * 24),
        );
        vipStatus =
          daysLeft > 0
            ? `<div class="text-[10px] text-yellow-500 mt-1">เหลือ ${daysLeft} วัน</div>`
            : `<div class="text-[10px] text-red-400 mt-1">หมดอายุแล้ว</div>`;
      }

      return `
        <tr class="hover:bg-slate-900 transition ${u.isBanned ? "opacity-50 grayscale" : ""}">
            <td class="p-4 font-bold text-white">
                ${u.username}
                ${isMainAdmin ? '<i class="fa-solid fa-shield-halved text-sky-500 ml-2" title="Main Admin"></i>' : ""}
                ${u.isBanned ? '<span class="ml-2 text-red-500 text-xs border border-red-500 px-1 rounded">BANNED</span>' : ""}
            </td>
            <td class="p-4"><span class="bg-slate-800 px-2 py-1 rounded text-xs uppercase text-slate-300">${u.role}</span></td>
            <td class="p-4 text-slate-400 text-sm">
                ${new Date(u.createdAt).toLocaleDateString("th-TH")}
                ${vipStatus}
            </td>
            <td class="p-4 text-right">
                ${
                  !isMainAdmin
                    ? `
                    <button onclick="editUserRole('${u._id}', '${u.role}', '${u.username}', '${u.vipExpiresAt || ""}')" class="text-sky-400 hover:text-white p-2 transition"><i class="fa-solid fa-user-pen"></i></button>
                    ${
                      u.isBanned
                        ? `<button onclick="toggleBanUser('${u._id}', false)" class="text-emerald-400 hover:text-white p-2 transition" title="ปลดแบน"><i class="fa-solid fa-user-check"></i></button>`
                        : `<button onclick="toggleBanUser('${u._id}', true)" class="text-orange-400 hover:text-white p-2 transition" title="แบนผู้ใช้"><i class="fa-solid fa-ban"></i></button>`
                    }
                `
                    : `<span class="text-slate-600 p-2 cursor-not-allowed"><i class="fa-solid fa-user-pen"></i></span>`
                }
                ${u.role !== "admin" ? `<button onclick="deleteUser('${u._id}')" class="text-red-400 hover:text-white p-2 transition"><i class="fa-solid fa-trash-can"></i></button>` : ""}
            </td>
        </tr>
    `;
    })
    .join("");
}

function searchUsers() {
  const term = document.getElementById("userSearch").value.toLowerCase();
  const filtered = allUsers.filter((u) =>
    u.username.toLowerCase().includes(term),
  );
  renderUsers(filtered);
}

function editUserRole(id, currentRole, username, vipExpiresAt) {
  document.getElementById("editUserId").value = id;
  document.getElementById("editUserRole").value = currentRole;

  // Set Date
  if (vipExpiresAt) {
    const date = new Date(vipExpiresAt);
    document.getElementById("editVipExpire").value = date
      .toISOString()
      .split("T")[0];
  } else {
    document.getElementById("editVipExpire").value = "";
  }

  document.getElementById("editingUsername").innerText =
    "กำลังแก้ไข: " + username;

  document.getElementById("userRoleModal").classList.remove("hidden");
  toggleVipDateInput();
}

function closeUserRoleModal() {
  document.getElementById("userRoleModal").classList.add("hidden");
}

async function toggleBanUser(id, shouldBan) {
  if (
    !confirm(
      shouldBan
        ? "ต้องการแบนผู้ใช้งานนี้หรือไม่?"
        : "ต้องการปลดแบนผู้ใช้งานนี้หรือไม่?",
    )
  )
    return;
  try {
    const res = await secureFetch(`${API_URL}/users/${id}`, {
      method: "PUT",
      body: JSON.stringify({ isBanned: shouldBan }),
    });
    const json = await res.json();
    if (json.success) {
      loadUsers();
      showToast(
        shouldBan ? "แบนผู้ใช้งานสำเร็จ" : "ปลดแบนผู้ใช้งานสำเร็จ",
        "success",
      );
    } else {
      showToast(json.message, "error");
    }
  } catch (err) {
    showToast("เกิดข้อผิดพลาด", "error");
  }
}

async function deleteUser(id) {
  if (!confirm("ต้องการลบผู้ใช้งานนี้จริงหรือไม่?")) return;
  try {
    const res = await secureFetch(`${API_URL}/users/${id}`, {
      method: "DELETE",
    });
    const json = await res.json();
    if (json.success) {
      loadUsers();
    } else {
      showToast(json.message, "error");
    }
  } catch (err) {
    showToast("เกิดข้อผิดพลาด", "error");
  }
}

// --- ANNOUNCEMENT MANAGEMENT ---
async function loadAnnouncement() {
  try {
    const res = await fetch(`${API_URL}/announcement`);
    const json = await res.json();
    if (json.success) {
      document.getElementById("annText").value = json.data.text;
      document.getElementById("annActive").checked = json.data.isActive;
      const color = json.data.color || "orange";
      const radio = document.querySelector(
        `input[name="annColor"][value="${color}"]`,
      );
      if (radio) radio.checked = true;
    }
  } catch (err) {
    showToast("โหลดข้อมูลประกาศไม่สำเร็จ", "error");
  }
}

// --- PASSWORD MANAGEMENT ---
function openPasswordModal() {
  document.getElementById("passwordModal").classList.remove("hidden");
  document.getElementById("passwordForm").reset();
}
function closePasswordModal() {
  document.getElementById("passwordModal").classList.add("hidden");
}

// --- BATCH IMPORT SYSTEM ---
function openBatchModal() {
  document.getElementById("batchModal").classList.remove("hidden");
  resetBatchModal();
}
function closeBatchModal() {
  document.getElementById("batchModal").classList.add("hidden");
}

function resetBatchModal() {
  document.getElementById("batchInputStep").classList.remove("hidden");
  document.getElementById("batchReviewStep").classList.add("hidden");
  document.getElementById("batchLinks").value = "";
  document.getElementById("batchLog").classList.add("hidden");
  document.getElementById("batchLog").innerHTML = "";
  batchTempData = [];
}

async function analyzeBatchLinks() {
  const links = document
    .getElementById("batchLinks")
    .value.trim()
    .split("\n")
    .filter((l) => l.trim() !== "");
  if (links.length === 0)
    return showToast("กรุณาวางลิงก์อย่างน้อย 1 ลิงก์", "error");

  const btn = document.getElementById("btnAnalyzeBatch");
  btn.disabled = true;
  btn.innerHTML =
    '<i class="fa-solid fa-circle-notch fa-spin"></i> กำลังวิเคราะห์...';

  batchTempData = [];

  for (let i = 0; i < links.length; i++) {
    const url = links[i].trim();
    const vid = url.match(/(?:v=|\/)([0-9A-Za-z_-]{11})/)?.[1];
    if (!vid) continue;

    try {
      const resAi = await secureFetch(`${API_URL}/fetch-movie-data`, {
        method: "POST",
        body: JSON.stringify({ videoId: vid }),
      });
      const jsonAi = await resAi.json();
      if (jsonAi.success) {
        batchTempData.push(jsonAi.data);
      }
    } catch (err) {
      console.error(err);
    }
  }

  btn.disabled = false;
  btn.innerHTML =
    '<i class="fa-solid fa-magnifying-glass mr-2"></i> วิเคราะห์ข้อมูล (Step 1)';

  if (batchTempData.length === 0)
    return showToast("ไม่สามารถดึงข้อมูลได้เลย กรุณาตรวจสอบลิงก์", "error");

  // Switch to Review Step
  document.getElementById("batchInputStep").classList.add("hidden");
  document.getElementById("batchReviewStep").classList.remove("hidden");
  document.getElementById("batchReviewStep").classList.add("flex");
  renderBatchReview();
}

function renderBatchReview() {
  const container = document.getElementById("batchReviewList");
  container.innerHTML = batchTempData
    .map(
      (item, index) => `
        <div class="flex gap-4 bg-slate-800/50 p-3 rounded-xl border border-slate-700">
            <img src="${item.posterUrl}" id="batch-img-${index}" class="w-20 h-28 object-cover rounded-lg bg-slate-900 shrink-0">
            <div class="flex-1 space-y-2 min-w-0">
                <input type="text" value="${item.title}" onchange="updateBatchItem(${index}, 'title', this.value)" class="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-sm font-bold text-white placeholder-slate-500" placeholder="ชื่อเรื่อง">
                <div class="flex gap-2">
                    <input type="text" value="${item.year}" onchange="updateBatchItem(${index}, 'year', this.value)" class="w-16 bg-slate-900 border border-slate-700 rounded px-2 py-1 text-xs text-slate-300 text-center" placeholder="ปี">
                    <input type="text" value="${item.posterUrl}" oninput="updateBatchPoster(${index}, this.value)" class="flex-1 bg-slate-900 border border-slate-700 rounded px-2 py-1 text-xs text-sky-400 font-mono truncate focus:text-clip focus:overflow-visible focus:absolute focus:z-10 focus:w-auto" placeholder="URL รูปปก (แก้ไขได้)">
                </div>
                <div class="text-xs text-slate-500 truncate">${item.description}</div>
            </div>
            <button onclick="removeBatchItem(${index})" class="text-slate-500 hover:text-red-400 px-2"><i class="fa-solid fa-times"></i></button>
        </div>
    `,
    )
    .join("");
}

function updateBatchItem(index, field, value) {
  batchTempData[index][field] = value;
}
function updateBatchPoster(index, url) {
  batchTempData[index].posterUrl = url;
  document.getElementById(`batch-img-${index}`).src = url;
}
function removeBatchItem(index) {
  batchTempData.splice(index, 1);
  renderBatchReview();
}

async function confirmBatchImport() {
  const btn = document.getElementById("btnSaveBatch");
  const logDiv = document.getElementById("batchLog");
  btn.disabled = true;
  logDiv.classList.remove("hidden");
  logDiv.innerHTML = "";

  for (let i = 0; i < batchTempData.length; i++) {
    try {
      const resSave = await secureFetch(`${API_URL}/movies`, {
        method: "POST",
        body: JSON.stringify(batchTempData[i]),
      });

      if (resSave.ok)
        logDiv.innerHTML += `<div class="text-green-400 mb-1">✅ บันทึกสำเร็จ: ${batchTempData[i].title}</div>`;
      else throw new Error("Failed");
    } catch (err) {
      logDiv.innerHTML += `<div class="text-red-400 mb-1">❌ ผิดพลาด: ${batchTempData[i].title}</div>`;
    }
    logDiv.scrollTop = logDiv.scrollHeight;
  }

  logDiv.innerHTML += `<div class="text-slate-300 mt-2">--- จบการทำงาน ---</div>`;
  btn.disabled = false;
  loadMovies(); // Refresh Table
}

// --- BACKUP SYSTEM ---
async function backupDatabase() {
  if (!confirm("ต้องการดาวน์โหลดไฟล์ Backup ฐานข้อมูลใช่หรือไม่?")) return;

  try {
    const res = await secureFetch(`${API_URL}/backup`);
    const json = await res.json();

    if (json.success) {
      const dataStr =
        "data:text/json;charset=utf-8," +
        encodeURIComponent(JSON.stringify(json.data, null, 2));
      const downloadAnchorNode = document.createElement("a");
      downloadAnchorNode.setAttribute("href", dataStr);
      downloadAnchorNode.setAttribute(
        "download",
        "duydodee_backup_" + new Date().toISOString().slice(0, 10) + ".json",
      );
      document.body.appendChild(downloadAnchorNode);
      downloadAnchorNode.click();
      downloadAnchorNode.remove();
    } else {
      alert(json.message);
    }
  } catch (err) {
    showToast("เกิดข้อผิดพลาดในการ Backup", "error");
  }
}

// --- RESTORE SYSTEM ---
function triggerRestore() {
  document.getElementById("restoreFile").click();
}

async function restoreDatabase(input) {
  const file = input.files[0];
  if (!file) return;

  if (
    !confirm(
      '⚠️ คำเตือน: การกู้คืนข้อมูลจะ "ลบข้อมูลปัจจุบันทั้งหมด" และแทนที่ด้วยไฟล์ Backup\n\nคุณแน่ใจหรือไม่ที่จะดำเนินการต่อ?',
    )
  ) {
    input.value = ""; // Reset input
    return;
  }

  const reader = new FileReader();
  reader.onload = async (e) => {
    try {
      const data = JSON.parse(e.target.result);

      // ตรวจสอบโครงสร้างไฟล์คร่าวๆ
      if (!data.timestamp || (!data.movies && !data.users)) {
        throw new Error(
          "รูปแบบไฟล์ไม่ถูกต้อง หรือไม่ใช่ไฟล์ Backup ของระบบนี้",
        );
      }

      const res = await secureFetch(`${API_URL}/restore`, {
        method: "POST",
        body: JSON.stringify(data),
      });

      const json = await res.json();
      if (json.success) {
        alert("✅ กู้คืนข้อมูลสำเร็จ! กรุณาเข้าสู่ระบบใหม่");
        logout();
      } else {
        alert(json.message);
      }
    } catch (err) {
      alert("เกิดข้อผิดพลาด: " + err.message);
    } finally {
      input.value = "";
    }
  };
  reader.readAsText(file);
}

window.toggleVipDateInput = () => {
  const role = document.getElementById("editUserRole").value;
  const container = document.getElementById("vipDateContainer");
  container.classList.toggle("hidden", role !== "vip");
};
