// CONFIG
const API_URL = 'http://localhost:5000/api/movies'; 
const LOGIN_API_URL = 'http://localhost:5000/api/login';
let moviesData = [];
let isEditMode = false;

// --- CORE FUNCTIONS ---

document.addEventListener('DOMContentLoaded', () => {
    checkAuthState(); // ตรวจสอบสถานะ Login เมื่อโหลดหน้า
    fetchMovies();

    // Handle Forms
    document.getElementById('movieForm').addEventListener('submit', handleFormSubmit);
    document.getElementById('loginForm').addEventListener('submit', handleLogin);

    // Handle Logout
    document.getElementById('logoutButton').addEventListener('click', logout);
});

async function fetchMovies() {
    try {
        // ยิงไปที่ Database ของจริง
        const res = await fetch(API_URL);
        if(!res.ok) throw new Error("API Error");
        const data = await res.json();
        
        // ใช้ข้อมูลจาก Database
        moviesData = data.data || [];
    } catch (err) {
        console.warn("ไม่สามารถเชื่อมต่อ Server ได้ (ตรวจสอบว่ารัน node server.js หรือยัง)", err);
        // ถ้าต่อไม่ได้ ให้ใช้ array ว่างๆ หรือโชว์ error
        moviesData = []; 
        document.getElementById('movieGrid').innerHTML = `
            <div class="col-span-full text-center py-20 text-red-500">
                <i class="fa-solid fa-triangle-exclamation text-3xl mb-3"></i>
                <p>เชื่อมต่อ Server ไม่ได้ กรุณารัน Backend ก่อน</p>
            </div>`;
    }
    renderAllViews();
}

function renderAllViews() {
    renderMovieGrid(moviesData);
    renderAdminTable(moviesData);
    renderAdminStats(moviesData);
}

// --- AI & SMART IMPORT ---

async function aiAutoFill() {
    const url = document.getElementById('inpAiLink').value.trim();
    if (!url) { alert('กรุณาวางลิงก์ YouTube ก่อนครับ'); return; }

    const videoId = extractYouTubeID(url);
    if (!videoId) { alert('รูปแบบลิงก์ไม่ถูกต้อง กรุณาลองใหม่'); return; }

    const btn = document.querySelector('button[onclick="aiAutoFill()"]');
    const originalText = btn.innerHTML;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> กำลังดึง...';
    btn.disabled = true;

    try {
        document.getElementById('inpYt').value = videoId;
        const posterUrl = `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`;
        document.getElementById('inpPoster').value = posterUrl;
        updatePreview();

        const res = await fetch(`https://noembed.com/embed?url=https://www.youtube.com/watch?v=${videoId}`);
        const data = await res.json();
        
        if (data.title) {
            document.getElementById('inpTitle').value = data.title;
        } else {
            document.getElementById('inpTitle').value = "New Video " + videoId;
        }
        document.getElementById('inpRating').value = (Math.random() * (9.9 - 7.0) + 7.0).toFixed(1);

    } catch (e) {
        console.error(e);
        alert('ดึงข้อมูลบางส่วนไม่สำเร็จ แต่ได้ ID มาแล้ว');
    } finally {
        btn.innerHTML = '<i class="fa-solid fa-check"></i> เรียบร้อย';
        setTimeout(() => {
            btn.innerHTML = originalText;
            btn.disabled = false;
        }, 2000);
    }
}

function extractYouTubeID(url) {
    const regExp = /^(?:https?:\/\/)?(?:www\.)?(?:youtube\.com\/(?:[^\/\n\s]+\/\S+\/|(?:v|e(?:mbed)?)\/|\S*?[?&]v=)|youtu\.be\/)([a-zA-Z0-9_-]{11})/;
    const match = url.match(regExp);
    return (match && match[1]) ? match[1] : null;
}

function updatePreview() {
    const url = document.getElementById('inpPoster').value;
    if(url) document.getElementById('posterPreview').src = url;
}

// --- RENDERERS ---

function renderMovieGrid(movies) {
    const grid = document.getElementById('movieGrid');
    if(movies.length === 0) {
         // ถ้าไม่มีข้อมูล ให้แสดงข้อความ
        if (!grid.innerHTML.includes('เชื่อมต่อ Server ไม่ได้')) {
             grid.innerHTML = `<div class="col-span-full text-center py-10 text-slate-500">ไม่พบข้อมูล</div>`;
        }
        return;
    }
    grid.innerHTML = movies.map(m => `
        <div class="group cursor-pointer relative" onclick="openPlayer('${m.id}')">
            <div class="aspect-[2/3] rounded-xl overflow-hidden mb-3 relative shadow-lg bg-slate-800 border border-slate-700/50">
                <img src="${m.posterUrl || 'https://via.placeholder.com/300x450?text=No+Image'}" 
                     alt="${m.title}"
                     class="w-full h-full object-cover group-hover:scale-110 transition duration-500 brightness-90 group-hover:brightness-110">
                <div class="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition flex items-center justify-center">
                    <div class="w-12 h-12 bg-sky-600 rounded-full flex items-center justify-center shadow-xl scale-0 group-hover:scale-100 transition duration-300">
                        <i class="fa-solid fa-play text-white"></i>
                    </div>
                </div>
                <span class="absolute top-2 right-2 bg-sky-600 text-white text-[10px] font-bold px-1.5 py-0.5 rounded shadow">HD</span>
            </div>
            <h3 class="text-sm font-semibold text-slate-200 group-hover:text-sky-400 transition line-clamp-1">${m.title}</h3>
            <div class="flex justify-between text-[11px] text-slate-500 mt-1 font-medium">
                <span>${m.year}</span>
                <span class="text-yellow-500"><i class="fa-solid fa-star"></i> ${m.rating}</span>
            </div>
        </div>
    `).join('');
}

function renderAdminTable(movies) {
    const tbody = document.getElementById('adminTableBody');
    tbody.innerHTML = movies.map(m => `
        <tr class="hover:bg-slate-800/50 transition border-b border-slate-800/50 last:border-0">
            <td class="px-6 py-3">
                <img src="${m.posterUrl}" alt="Poster of ${m.title}" class="w-10 h-14 object-cover rounded bg-slate-700 border border-slate-600">
            </td>
            <td class="px-6 py-3 font-medium text-white">${m.title}</td>
            <td class="px-6 py-3">
                <div class="flex flex-col text-xs text-slate-400 gap-1">
                    <span class="bg-slate-800 px-2 py-0.5 rounded w-fit">${m.year}</span>
                    <span class="text-yellow-500"><i class="fa-solid fa-star"></i> ${m.rating}</span>
                </div>
            </td>
            <td class="px-6 py-3 font-mono text-xs text-sky-400 bg-slate-900/30 rounded">${m.ytId}</td>
            <td class="px-6 py-3 text-right space-x-2">
                <button onclick="editMovie('${m.id}')" class="text-blue-400 hover:text-white hover:bg-blue-600 bg-blue-500/10 p-2 rounded-lg transition"><i class="fa-solid fa-pen"></i></button>
                <button onclick="deleteMovie('${m.id}')" class="text-red-400 hover:text-white hover:bg-red-600 bg-red-500/10 p-2 rounded-lg transition"><i class="fa-solid fa-trash"></i></button>
            </td>
        </tr>
    `).join('');
}

function renderAdminStats(movies) {
    // 1. Total Movies
    document.getElementById('adminTotalMovies').innerText = movies.length;

    // 2. Total Episodes (Sum)
    const totalEp = movies.reduce((sum, m) => sum + (parseInt(m.episodes) || 0), 0);
    document.getElementById('adminTotalEpisodes').innerText = totalEp.toLocaleString();

    // 3. Average Rating
    const avgRating = movies.length ? (movies.reduce((sum, m) => sum + (parseFloat(m.rating) || 0), 0) / movies.length).toFixed(1) : "0.0";
    document.getElementById('adminAvgRating').innerText = avgRating;
}

// --- NAVIGATION & PLAYER ---

function switchView(viewName) {
    // ป้องกันการเข้าหน้า Admin หากยังไม่ Login
    if (viewName === 'admin' && !localStorage.getItem('accessToken')) {
        openLoginModal();
        return; // หยุดการทำงาน
    }

    document.getElementById('homeView').classList.add('hidden');
    document.getElementById('playerView').classList.add('hidden');
    document.getElementById('adminView').classList.add('hidden');
    document.getElementById('mainPlayer').src = ""; 

    document.getElementById(viewName + 'View').classList.remove('hidden');
    // ซ่อนปุ่ม Admin ถ้าไม่ได้ Login
    checkAuthState();
    window.scrollTo(0, 0);
}

function openPlayer(id) {
    const movie = moviesData.find(m => String(m.id) === String(id));
    if(!movie) return;

    document.getElementById('playerTitle').innerText = movie.title;
    document.getElementById('playerDesc').innerText = "เรื่องราวสุดเข้มข้นของ " + movie.title + " ที่แฟนๆ รอคอย...";
    document.getElementById('playerYear').innerText = movie.year;
    document.getElementById('playerRating').innerText = movie.rating;
    document.getElementById('playerPoster').src = movie.posterUrl;
    document.getElementById('playerPoster').alt = `Poster of ${movie.title}`;
    document.getElementById('totalEpDisplay').innerText = `${movie.episodes} ตอน`;
    document.getElementById('playerBackdrop').style.backgroundImage = `url('${movie.posterUrl}')`;

    renderEpisodeList(movie);
    switchView('player');
}

function renderEpisodeList(movie) {
    const epList = document.getElementById('episodeList');
    const epContainer = epList.parentElement; // Assumes the list is in a container we can hide/show
    const player = document.getElementById('mainPlayer');

    // Always set the player source. The backend model only has one youtube ID per movie.
    player.src = `https://www.youtube.com/embed/${movie.ytId}?autoplay=1&rel=0`;

    // Only show episode buttons if there is more than one episode.
    if (movie.episodes > 1) {
        epContainer.classList.remove('hidden');
        let html = '';
        for (let i = 1; i <= movie.episodes; i++) {
            // The onclick now calls a function that only handles UI state
            html += `<button id="ep-btn-${i}" onclick="setActiveEpisode(${i}, ${movie.episodes})" 
                        class="border rounded-lg py-2.5 text-xs font-bold transition duration-200">
                        ${i}
                     </button>`;
        }
        epList.innerHTML = html;
        setActiveEpisode(1, movie.episodes); // Highlight the first episode
    } else {
        epContainer.classList.add('hidden');
        epList.innerHTML = ''; // Clear out any old buttons
    }
}

function setActiveEpisode(currentEp, totalEps) {
    // This function only updates the appearance of the buttons to show which is "active".
    // It does not change the video, as there is only one video ID available.
    for (let i = 1; i <= totalEps; i++) {
        const btn = document.getElementById(`ep-btn-${i}`);
        if (!btn) continue;

        const isActive = i === currentEp;
        // Toggle classes for active/inactive state
        btn.classList.toggle('bg-sky-600', isActive);
        btn.classList.toggle('text-white', isActive);
        btn.classList.toggle('shadow-lg', isActive);
        btn.classList.toggle('shadow-sky-600/50', isActive);
        btn.classList.toggle('scale-105', isActive);
        btn.classList.toggle('border-sky-500', isActive);
        btn.classList.toggle('bg-slate-800', !isActive);
        btn.classList.toggle('text-slate-400', !isActive);
        btn.classList.toggle('hover:bg-slate-700', !isActive);
        btn.classList.toggle('hover:text-white', !isActive);
        btn.classList.toggle('border-slate-700', !isActive);
    }
}

// --- AUTHENTICATION ---

function openLoginModal() {
    document.getElementById('loginModal').classList.remove('hidden');
}

function closeLoginModal() {
    document.getElementById('loginModal').classList.add('hidden');
    document.getElementById('loginError').classList.add('hidden');
}

async function handleLogin(e) {
    e.preventDefault();
    const username = document.getElementById('inpUsername').value;
    const password = document.getElementById('inpPassword').value;
    const btn = e.target.querySelector('button[type="submit"]');
    const originalText = btn.innerHTML;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> กำลังตรวจสอบ...';
    btn.disabled = true;

    try {
        const res = await fetch(LOGIN_API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
        });
        const data = await res.json();

        if (!res.ok || !data.success) {
            throw new Error(data.message || 'Login failed');
        }

        // *** เก็บ Token และข้อมูลผู้ใช้ลง LocalStorage ***
        localStorage.setItem('accessToken', data.accessToken);
        localStorage.setItem('user', JSON.stringify(data.user));

        closeLoginModal();
        checkAuthState(); // อัปเดต UI
        switchView('admin'); // ไปยังหน้า Admin หลัง Login สำเร็จ

    } catch (err) {
        const loginError = document.getElementById('loginError');
        loginError.innerText = '⚠️ ' + err.message;
        loginError.classList.remove('hidden');
    } finally {
        btn.innerHTML = originalText;
        btn.disabled = false;
    }
}

function logout() {
    localStorage.removeItem('accessToken');
    localStorage.removeItem('user');
    checkAuthState();
    switchView('home');
    alert('ออกจากระบบสำเร็จ');
}

function checkAuthState() {
    const token = localStorage.getItem('accessToken');
    const user = JSON.parse(localStorage.getItem('user'));
    const loginButton = document.getElementById('loginButton');
    const loggedInUserDiv = document.getElementById('loggedInUser');
    const usernameDisplay = document.getElementById('usernameDisplay');
    const adminNavButton = document.querySelector('button[onclick="switchView(\'admin\')"]');

    loginButton.classList.toggle('hidden', !!token);
    loggedInUserDiv.classList.toggle('hidden', !token);
    adminNavButton.classList.toggle('hidden', !token);
    if (token && user) usernameDisplay.innerText = `สวัสดี, ${user.name}`;
}

// --- ADMIN ACTIONS (CRUD) ---

function openModal() {
    document.getElementById('movieModal').classList.remove('hidden');
    document.getElementById('modalTitle').innerHTML = '<i class="fa-solid fa-plus text-sky-400"></i> เพิ่มหนังใหม่';
    document.getElementById('movieForm').reset();
    document.getElementById('editId').value = "";
    document.getElementById('posterPreview').src = "https://via.placeholder.com/300x450?text=No+Image";
    isEditMode = false;
}

function closeModal() {
    document.getElementById('movieModal').classList.add('hidden');
}

function editMovie(id) {
    const movie = moviesData.find(m => String(m.id) === String(id));
    if(!movie) return;

    openModal();
    document.getElementById('modalTitle').innerHTML = '<i class="fa-solid fa-pen-to-square text-sky-400"></i> แก้ไขข้อมูลหนัง';
    document.getElementById('inpTitle').value = movie.title;
    document.getElementById('inpYear').value = movie.year;
    document.getElementById('inpRating').value = movie.rating;
    document.getElementById('inpEp').value = movie.episodes;
    document.getElementById('inpPoster').value = movie.posterUrl;
    document.getElementById('inpYt').value = movie.ytId;
    document.getElementById('editId').value = movie.id;
    updatePreview();
    isEditMode = true;
}

// *** ฟังก์ชันสำหรับสร้าง Header พร้อม Token ***
function getAuthHeaders() {
    const token = localStorage.getItem('accessToken');
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    return headers;
}

// Handle Add/Edit Logic
async function handleFormSubmit(e) {
    e.preventDefault();
    
    const formData = {
        title: document.getElementById('inpTitle').value,
        year: document.getElementById('inpYear').value,
        rating: document.getElementById('inpRating').value,
        episodes: document.getElementById('inpEp').value,
        posterUrl: document.getElementById('inpPoster').value,
        ytId: document.getElementById('inpYt').value
    };

    const editId = document.getElementById('editId').value;
    const btnSubmit = e.target.querySelector('button[type="submit"]');
    btnSubmit.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> กำลังบันทึก...';

    try {
        let res;
        if(isEditMode) {
            // แก้ไข (PUT)
            res = await fetch(`${API_URL}/${editId}`, {
                method: 'PUT',
                headers: getAuthHeaders(), // <-- ใช้ Header ที่มี Token
                body: JSON.stringify(formData)
            });
        } else {
            // เพิ่มใหม่ (POST)
            res = await fetch(API_URL, {
                method: 'POST',
                headers: getAuthHeaders(), // <-- ใช้ Header ที่มี Token
                body: JSON.stringify(formData)
            });
        }
        
        if (!res.ok) {
            if (res.status === 401 || res.status === 403) {
                alert('Session หมดอายุ กรุณา Login ใหม่');
                logout();
            }
            throw new Error("Operation Failed: " + res.statusText);
        }
        
        const savedMovie = await res.json();

        if (isEditMode) {
            // Find index of the movie and update it
            const index = moviesData.findIndex(m => m.id === editId);
            if (index !== -1) {
                moviesData[index] = savedMovie.data;
            } else {
                // Fallback if something went wrong, re-fetch all
                return fetchMovies(); 
            }
        } else {
            // Add new movie to the top of the list
            moviesData.unshift(savedMovie.data);
        }

        closeModal();
        renderAllViews(); // Re-render UI with updated local data

    } catch (err) {
        console.error(err);
        alert("เกิดข้อผิดพลาด: " + err.message);
    } finally {
        btnSubmit.innerHTML = '<i class="fa-solid fa-save mr-2"></i> บันทึกข้อมูล';
    }
}

async function deleteMovie(id) {
    if(!confirm("คุณต้องการลบหนังเรื่องนี้ใช่ไหม? (ลบแล้วกู้คืนไม่ได้)")) return;
    
    try {
        const res = await fetch(`${API_URL}/${id}`, { 
            method: 'DELETE',
            headers: getAuthHeaders() // <-- ใช้ Header ที่มี Token
        });
        if (!res.ok) {
            if (res.status === 401 || res.status === 403) {
                alert('Session หมดอายุ กรุณา Login ใหม่');
                logout();
            }
            throw new Error("Delete Failed");
        }
        // Remove deleted movie from local array and re-render
        const index = moviesData.findIndex(m => m.id === id);
        if (index > -1) moviesData.splice(index, 1);
        renderAllViews();
    } catch (err) {
        alert("ลบไม่สำเร็จ: " + err.message);
    }
}

function searchMovies() {
    const query = document.getElementById("searchInput").value.toLowerCase();
    const filtered = moviesData.filter((m) =>
        m.title.toLowerCase().includes(query)
    );
    renderMovieGrid(filtered);
}