// CONFIG
const API_URL = (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
    ? 'http://localhost:5000/api'
    : '/api';
let allMovies = [];
let allUsers = [];
let batchTempData = []; // เก็บข้อมูลชั่วคราวสำหรับ Batch Import

// Global Token Variables
const getToken = () => localStorage.getItem('accessToken') || sessionStorage.getItem('accessToken');
const getRole = () => localStorage.getItem('userRole') || sessionStorage.getItem('userRole');

document.addEventListener('DOMContentLoaded', () => {
    // ตรวจสอบว่าเป็นหน้า Admin หรือไม่ (เช็คจาก Element ที่มีเฉพาะในหน้า Admin)
    if (document.getElementById('adminTableBody')) {
        initAdminPage();
    }
});

// --- SECURE FETCH (Auto Refresh Token) ---
async function secureFetch(url, options = {}) {
    let token = getToken();
    let headers = { ...options.headers, 'Content-Type': 'application/json' };
    
    if (token) {
        headers['Authorization'] = `Bearer ${token}`;
    }

    let res = await fetch(url, { ...options, headers });

    if (res.status === 401) {
        // Token หมดอายุ -> พยายาม Refresh
        try {
            const refreshRes = await fetch(`${API_URL}/refresh-token`, { method: 'POST' });
            if (refreshRes.ok) {
                const data = await refreshRes.json();
                if (data.accessToken) {
                    // บันทึก Token ใหม่ลงที่เดิม (Local หรือ Session)
                    if (localStorage.getItem('accessToken')) localStorage.setItem('accessToken', data.accessToken);
                    else sessionStorage.setItem('accessToken', data.accessToken);
                    
                    // Retry Request
                    headers['Authorization'] = `Bearer ${data.accessToken}`;
                    res = await fetch(url, { ...options, headers });
                    if (res.status !== 401) return res;
                }
            }
        } catch (err) { console.error('Refresh failed', err); }

        // ถ้า Refresh ไม่ผ่าน
        alert('เซสชั่นหมดอายุ กรุณาเข้าสู่ระบบใหม่');
        logout();
        throw new Error('Unauthorized');
    }
    return res;
}

// --- ADMIN PAGE INITIALIZATION ---
function initAdminPage() {
    // 1. Security Check
    if (!getToken() || getRole() !== 'admin') {
        alert('เฉพาะแอดมินเท่านั้นที่เข้าถึงหน้านี้ได้');
        window.location.href = 'login.html';
        return;
    }

    // 3. Display Admin Name
    const adminNameDisplay = document.getElementById('adminNameDisplay');
    if (adminNameDisplay) adminNameDisplay.innerText = (localStorage.getItem('username') || sessionStorage.getItem('username')) || 'Admin';

    // 4. Load Initial Data
    loadMovies();

    // 5. Attach Event Listeners
    const movieForm = document.getElementById('movieForm');
    if (movieForm) {
        movieForm.onsubmit = async (e) => {
            e.preventDefault();
            const id = document.getElementById('movieId').value;
            const data = {
                title: document.getElementById('title').value,
                year: document.getElementById('year').value,
                rating: document.getElementById('rating').value,
                ytId: document.getElementById('ytId').value,
                posterUrl: document.getElementById('posterUrl').value,
                category: document.getElementById('category').value,
                totalEpisodes: document.getElementById('totalEpisodes').value,
                description: document.getElementById('description').value,
                isVip: document.getElementById('isVip').checked
            };

            try {
                await secureFetch(id ? `${API_URL}/movies/${id}` : `${API_URL}/movies`, {
                    method: id ? 'PUT' : 'POST',
                    body: JSON.stringify(data)
                });
                closeModal();
                loadMovies();
            } catch (err) {
                alert('เกิดข้อผิดพลาดในการบันทึก');
            }
        };
    }

    const announcementForm = document.getElementById('announcementForm');
    if (announcementForm) {
        announcementForm.onsubmit = async (e) => {
            e.preventDefault();
            const text = document.getElementById('annText').value;
            const isActive = document.getElementById('annActive').checked;
            const color = document.querySelector('input[name="annColor"]:checked').value;
            try {
                const res = await secureFetch(`${API_URL}/announcement`, {
                    method: 'POST',
                    body: JSON.stringify({ text, isActive, color })
                });
                const json = await res.json();
                if (json.success) alert('บันทึกประกาศเรียบร้อย');
                else alert(json.message);
            } catch (err) { alert('เกิดข้อผิดพลาด'); }
        };
    }

    const userRoleForm = document.getElementById('userRoleForm');
    if (userRoleForm) {
        userRoleForm.onsubmit = async (e) => {
            e.preventDefault();
            const id = document.getElementById('editUserId').value;
            const role = document.getElementById('editUserRole').value;
            try {
                const res = await secureFetch(`${API_URL}/users/${id}`, {
                    method: 'PUT',
                    body: JSON.stringify({ role })
                });
                const json = await res.json();
                if (json.success) { closeUserRoleModal(); loadUsers(); } else { alert(json.message); }
            } catch (err) { alert('เกิดข้อผิดพลาด'); }
        };
    }

    const passwordForm = document.getElementById('passwordForm');
    if (passwordForm) {
        passwordForm.onsubmit = async (e) => {
            e.preventDefault();
            const oldPassword = document.getElementById('oldPass').value;
            const newPassword = document.getElementById('newPass').value;
            try {
                const res = await secureFetch(`${API_URL}/change-password`, {
                    method: 'PUT',
                    body: JSON.stringify({ oldPassword, newPassword })
                });
                const json = await res.json();
                if (json.success) { alert('เปลี่ยนรหัสผ่านสำเร็จ กรุณาเข้าสู่ระบบใหม่'); logout(); }
                else { alert(json.message); }
            } catch (err) { alert('เกิดข้อผิดพลาดในการเชื่อมต่อ'); }
        };
    }
}

// --- HELPER FUNCTIONS ---
async function logout() {
    if (confirm('ยืนยันการออกจากระบบ?')) {
        try {
            await fetch(`${API_URL}/logout`, { method: 'POST' });
        } catch (e) {
            console.error('Logout API failed', e);
        }
        localStorage.clear();
        sessionStorage.clear();
        window.location.href = 'login.html';
    }
}

// --- MOVIE MANAGEMENT ---
async function loadMovies() {
    try {
        const res = await secureFetch(`${API_URL}/movies`);
        if (res.status === 403) {
            alert('คุณไม่มีสิทธิ์เข้าถึง (ไม่ใช่เจ้าของระบบ)');
            localStorage.clear();
            window.location.href = 'login.html';
            return;
        }
        const json = await res.json();
        allMovies = json.data;
        renderTable(allMovies);
        updateStats();
    } catch (err) { alert('เชื่อมต่อ Server ไม่ได้'); }
}

function renderTable(movies) {
    document.getElementById('adminTableBody').innerHTML = movies.map(m => `
        <tr class="hover:bg-slate-900 transition">
            <td class="p-2">
                <img src="${m.posterUrl}" alt="${m.title}" class="w-12 h-auto object-cover rounded-md" onerror="this.onerror=null; this.src='https://placehold.co/300x450?text=No+Image'">
            </td>
            <td class="p-4 font-bold text-sm">${m.title} <br> <span class="text-xs text-slate-500 font-normal">${m.year}</span></td>
            <td class="p-4 text-xs font-medium uppercase text-slate-400">${m.category}</td>
            <td class="p-4">${m.isVip ? '<span class="text-yellow-500 text-xs font-bold bg-yellow-500/10 px-2 py-1 rounded border border-yellow-500/20"><i class="fa-solid fa-crown"></i> VIP</span>' : '<span class="text-slate-500 text-xs">FREE</span>'}</td>
            <td class="p-4 text-right">
                <button onclick="editMovie('${m._id}')" class="text-sky-400 hover:text-white p-2 transition"><i class="fa-solid fa-pen-to-square"></i></button>
                <button onclick="deleteMovie('${m._id}')" class="text-red-400 hover:text-white p-2 transition"><i class="fa-solid fa-trash-can"></i></button>
            </td>
        </tr>
    `).join('');
}

function updateStats() {
    document.getElementById('statTotal').innerText = allMovies.length;
    document.getElementById('statVip').innerText = allMovies.filter(m => m.isVip).length;
}

function searchAdmin() {
    const searchTerm = document.getElementById('adminSearch').value.toLowerCase().trim();
    const filteredMovies = allMovies.filter(movie => movie.title.toLowerCase().includes(searchTerm));
    renderTable(filteredMovies);
}

async function fetchAiData() {
    const btn = document.getElementById('aiBtn');
    const url = document.getElementById('aiUrl').value;
    const vid = url.match(/(?:v=|\/)([0-9A-Za-z_-]{11})/)?.[1] || url;

    if (!vid) return alert('ใส่ลิงก์ YouTube ก่อนครับ');

    btn.disabled = true;
    btn.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> AI กำลังทำงาน...';

    try {
        const res = await secureFetch(`${API_URL}/fetch-movie-data`, {
            method: 'POST',
            body: JSON.stringify({ videoId: vid })
        });
        const json = await res.json();

        if (json.success) {
            const d = json.data;
            document.getElementById('title').value = d.title;
            document.getElementById('year').value = d.year;
            document.getElementById('rating').value = d.rating;
            document.getElementById('ytId').value = d.ytId;
            document.getElementById('posterUrl').value = d.posterUrl;
            document.getElementById('description').value = d.description + "\n\nนักแสดง: " + d.actors + "\nข้อคิด: " + d.lessons;
            if (d.category) document.getElementById('category').value = d.category;
            updatePreview();
        } else {
            alert(json.message || 'AI ไม่สามารถดึงข้อมูลได้');
        }
    } catch (err) { console.error(err); alert('เกิดข้อผิดพลาดในการเชื่อมต่อ'); }

    btn.disabled = false;
    btn.innerHTML = '<i class="fa-solid fa-robot"></i> ดึงข้อมูล AI';
}

// --- UI HELPERS ---
function openModal() { document.getElementById('movieModal').classList.remove('hidden'); document.getElementById('movieForm').reset(); document.getElementById('movieId').value = ''; updatePreview(); }
function closeModal() { document.getElementById('movieModal').classList.add('hidden'); }
function updatePreview() {
    const url = document.getElementById('posterUrl').value;
    const img = document.getElementById('posterPreview');
    const placeholder = document.getElementById('posterPlaceholder');
    if (url) { img.src = url; img.classList.remove('hidden'); placeholder.classList.add('hidden'); }
    else { img.classList.add('hidden'); placeholder.classList.remove('hidden'); }
}

function editMovie(id) {
    const m = allMovies.find(i => i._id === id);
    document.getElementById('movieId').value = m._id;
    document.getElementById('title').value = m.title;
    document.getElementById('year').value = m.year;
    document.getElementById('rating').value = m.rating;
    document.getElementById('ytId').value = m.ytId;
    document.getElementById('posterUrl').value = m.posterUrl;
    document.getElementById('category').value = m.category;
    document.getElementById('totalEpisodes').value = m.totalEpisodes;
    document.getElementById('description').value = m.description;
    document.getElementById('isVip').checked = m.isVip;
    updatePreview();
    document.getElementById('movieModal').classList.remove('hidden');
}

async function deleteMovie(id) {
    if (confirm('ต้องการลบซีรีส์เรื่องนี้จริงหรือไม่?')) {
        await secureFetch(`${API_URL}/movies/${id}`, { method: 'DELETE' });
        loadMovies();
    }
}

// --- SECTION NAVIGATION ---
function showSection(section) {
    document.getElementById('moviesSection').classList.toggle('hidden', section !== 'movies');
    document.getElementById('usersSection').classList.toggle('hidden', section !== 'users');
    document.getElementById('announcementSection').classList.toggle('hidden', section !== 'announcement');

    const navMovies = document.getElementById('nav-movies');
    const navUsers = document.getElementById('nav-users');
    const navAnn = document.getElementById('nav-announcement');

    const activeClass = "bg-sky-600 text-white font-bold shadow-lg shadow-sky-900/20".split(" ");
    const inactiveClass = "text-slate-400 hover:bg-slate-900".split(" ");

    [navMovies, navUsers, navAnn].forEach(nav => {
        nav.classList.remove(...activeClass);
        nav.classList.add(...inactiveClass);
    });

    if (section === 'movies') {
        navMovies.classList.add(...activeClass); navMovies.classList.remove(...inactiveClass);
    } else if (section === 'users') {
        navUsers.classList.add(...activeClass); navUsers.classList.remove(...inactiveClass);
        loadUsers();
    } else if (section === 'announcement') {
        navAnn.classList.add(...activeClass); navAnn.classList.remove(...inactiveClass);
        loadAnnouncement();
    }
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
    } catch (err) { alert('โหลดข้อมูลผู้ใช้ไม่สำเร็จ'); }
}

function renderUsers(users) {
    document.getElementById('usersTableBody').innerHTML = users.map(u => `
        <tr class="hover:bg-slate-900 transition">
            <td class="p-4 font-bold text-white">${u.username}</td>
            <td class="p-4"><span class="bg-slate-800 px-2 py-1 rounded text-xs uppercase text-slate-300">${u.role}</span></td>
            <td class="p-4 text-slate-400 text-sm">${new Date(u.createdAt).toLocaleDateString('th-TH')}</td>
            <td class="p-4 text-right">
                <button onclick="editUserRole('${u._id}', '${u.role}', '${u.username}')" class="text-sky-400 hover:text-white p-2 transition"><i class="fa-solid fa-user-pen"></i></button>
                ${u.role !== 'admin' ? `<button onclick="deleteUser('${u._id}')" class="text-red-400 hover:text-white p-2 transition"><i class="fa-solid fa-trash-can"></i></button>` : ''}
            </td>
        </tr>
    `).join('');
}

function searchUsers() {
    const term = document.getElementById('userSearch').value.toLowerCase();
    const filtered = allUsers.filter(u => u.username.toLowerCase().includes(term));
    renderUsers(filtered);
}

function editUserRole(id, currentRole, username) {
    document.getElementById('editUserId').value = id;
    document.getElementById('editUserRole').value = currentRole;
    document.getElementById('editingUsername').innerText = 'กำลังแก้ไข: ' + username;
    document.getElementById('userRoleModal').classList.remove('hidden');
}

function closeUserRoleModal() { document.getElementById('userRoleModal').classList.add('hidden'); }

async function deleteUser(id) {
    if (!confirm('ต้องการลบผู้ใช้งานนี้จริงหรือไม่?')) return;
    try {
        const res = await secureFetch(`${API_URL}/users/${id}`, { method: 'DELETE' });
        const json = await res.json();
        if (json.success) { loadUsers(); } else { alert(json.message); }
    } catch (err) { alert('เกิดข้อผิดพลาด'); }
}

// --- ANNOUNCEMENT MANAGEMENT ---
async function loadAnnouncement() {
    try {
        const res = await fetch(`${API_URL}/announcement`);
        const json = await res.json();
        if (json.success) {
            document.getElementById('annText').value = json.data.text;
            document.getElementById('annActive').checked = json.data.isActive;
            const color = json.data.color || 'orange';
            const radio = document.querySelector(`input[name="annColor"][value="${color}"]`);
            if (radio) radio.checked = true;
        }
    } catch (err) { alert('โหลดข้อมูลประกาศไม่สำเร็จ'); }
}

// --- PASSWORD MANAGEMENT ---
function openPasswordModal() { document.getElementById('passwordModal').classList.remove('hidden'); document.getElementById('passwordForm').reset(); }
function closePasswordModal() { document.getElementById('passwordModal').classList.add('hidden'); }

// --- BATCH IMPORT SYSTEM ---
function openBatchModal() { 
    document.getElementById('batchModal').classList.remove('hidden'); 
    resetBatchModal();
}
function closeBatchModal() { document.getElementById('batchModal').classList.add('hidden'); }

function resetBatchModal() {
    document.getElementById('batchInputStep').classList.remove('hidden');
    document.getElementById('batchReviewStep').classList.add('hidden');
    document.getElementById('batchLinks').value = '';
    document.getElementById('batchLog').classList.add('hidden');
    document.getElementById('batchLog').innerHTML = '';
    batchTempData = [];
}

async function analyzeBatchLinks() {
    const links = document.getElementById('batchLinks').value.trim().split('\n').filter(l => l.trim() !== '');
    if (links.length === 0) return alert('กรุณาวางลิงก์อย่างน้อย 1 ลิงก์');

    const btn = document.getElementById('btnAnalyzeBatch');
    btn.disabled = true;
    btn.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> กำลังวิเคราะห์...';
    
    batchTempData = [];

    for (let i = 0; i < links.length; i++) {
        const url = links[i].trim();
        const vid = url.match(/(?:v=|\/)([0-9A-Za-z_-]{11})/)?.[1];
        if (!vid) continue;
        
        try {
            const resAi = await secureFetch(`${API_URL}/fetch-movie-data`, {
                method: 'POST',
                body: JSON.stringify({ videoId: vid })
            });
            const jsonAi = await resAi.json();
            if (jsonAi.success) {
                batchTempData.push(jsonAi.data);
            }
        } catch (err) { console.error(err); }
    }

    btn.disabled = false;
    btn.innerHTML = '<i class="fa-solid fa-magnifying-glass mr-2"></i> วิเคราะห์ข้อมูล (Step 1)';
    
    if (batchTempData.length === 0) return alert('ไม่สามารถดึงข้อมูลได้เลย กรุณาตรวจสอบลิงก์');
    
    // Switch to Review Step
    document.getElementById('batchInputStep').classList.add('hidden');
    document.getElementById('batchReviewStep').classList.remove('hidden');
    document.getElementById('batchReviewStep').classList.add('flex');
    renderBatchReview();
}

function renderBatchReview() {
    const container = document.getElementById('batchReviewList');
    container.innerHTML = batchTempData.map((item, index) => `
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
    `).join('');
}

function updateBatchItem(index, field, value) { batchTempData[index][field] = value; }
function updateBatchPoster(index, url) { batchTempData[index].posterUrl = url; document.getElementById(`batch-img-${index}`).src = url; }
function removeBatchItem(index) { batchTempData.splice(index, 1); renderBatchReview(); }

async function confirmBatchImport() {
    const btn = document.getElementById('btnSaveBatch');
    const logDiv = document.getElementById('batchLog');
    btn.disabled = true;
    logDiv.classList.remove('hidden');
    logDiv.innerHTML = '';

    for (let i = 0; i < batchTempData.length; i++) {
        try {
            const resSave = await secureFetch(`${API_URL}/movies`, {
                method: 'POST',
                body: JSON.stringify(batchTempData[i])
            });
            
            if (resSave.ok) logDiv.innerHTML += `<div class="text-green-400 mb-1">✅ บันทึกสำเร็จ: ${batchTempData[i].title}</div>`;
            else throw new Error('Failed');
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
    if (!confirm('ต้องการดาวน์โหลดไฟล์ Backup ฐานข้อมูลใช่หรือไม่?')) return;
    
    try {
        const res = await secureFetch(`${API_URL}/backup`);
        const json = await res.json();
        
        if (json.success) {
            const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(json.data, null, 2));
            const downloadAnchorNode = document.createElement('a');
            downloadAnchorNode.setAttribute("href", dataStr);
            downloadAnchorNode.setAttribute("download", "duydodee_backup_" + new Date().toISOString().slice(0,10) + ".json");
            document.body.appendChild(downloadAnchorNode);
            downloadAnchorNode.click();
            downloadAnchorNode.remove();
        } else { alert(json.message); }
    } catch (err) { alert('เกิดข้อผิดพลาดในการ Backup'); }
}

// --- RESTORE SYSTEM ---
function triggerRestore() {
    document.getElementById('restoreFile').click();
}

async function restoreDatabase(input) {
    const file = input.files[0];
    if (!file) return;

    if (!confirm('⚠️ คำเตือน: การกู้คืนข้อมูลจะ "ลบข้อมูลปัจจุบันทั้งหมด" และแทนที่ด้วยไฟล์ Backup\n\nคุณแน่ใจหรือไม่ที่จะดำเนินการต่อ?')) {
        input.value = ''; // Reset input
        return;
    }

    const reader = new FileReader();
    reader.onload = async (e) => {
        try {
            const data = JSON.parse(e.target.result);
            
            // ตรวจสอบโครงสร้างไฟล์คร่าวๆ
            if (!data.timestamp || (!data.movies && !data.users)) {
                throw new Error('รูปแบบไฟล์ไม่ถูกต้อง หรือไม่ใช่ไฟล์ Backup ของระบบนี้');
            }

            const res = await secureFetch(`${API_URL}/restore`, {
                method: 'POST',
                body: JSON.stringify(data)
            });

            const json = await res.json();
            if (json.success) {
                alert('✅ กู้คืนข้อมูลสำเร็จ! กรุณาเข้าสู่ระบบใหม่');
                logout();
            } else { alert(json.message); }
        } catch (err) { alert('เกิดข้อผิดพลาด: ' + err.message); }
        finally { input.value = ''; }
    };
    reader.readAsText(file);
}