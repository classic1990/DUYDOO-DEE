async function loadMovies() {
    const movieContainer = document.querySelector('.movie-grid');
    if (!movieContainer) return;
    try {
        const response = await fetch('/api/movies');
        const movies = await response.json();
        movieContainer.innerHTML = movies.map(movie => `
            <div class="movie-card">
                <img src="${movie.posterUrl || 'assets/img/no-image.png'}">
                <h3>${movie.title}</h3>
            </div>
        `).join('');
    } catch (e) { console.error(e); }
}
document.addEventListener('DOMContentLoaded', loadMovies);