async function loadLovedTracks() {
  try {
    const res = await fetch("/api/loved-tracks");
    const tracks = await res.json();
    const container = document.getElementById("loved-tracks-grid");
    const loading = document.getElementById("loading");

    loading.style.display = "none";

    if (!tracks.length) {
      container.innerHTML = '<div class="col-12 text-center text-gray">No loved tracks found. Try syncing!</div>';
      return;
    }

    container.innerHTML = tracks.map(t => `
      <div class="col-md-6 col-lg-4">
        <div class="card bg-light text-white shadow-sm h-100 hover-card">
          <div class="d-flex g-0">
            <div class="flex-shrink-0">
              <img src="${t.image || '/images/default-album.png'}" 
                   class="img-fluid rounded-start h-100 object-fit-cover" 
                   style="width: 100px; max-height: 100px;" 
                   alt="${t.artist}">
            </div>
            <div class="card-body">
              <h6 class="card-title text-truncate" title="${t.track}">
                <a href="${t.url}" target="_blank" class="text-white text-decoration-none">${t.track}</a>
              </h6>
              <p class="card-text text-gray text-truncate mb-1" title="${t.artist}">
                ${t.artist}
              </p>
              <small class="text-green">
                <i class="mdi mdi-heart"></i> ${new Date(t.loved_at * 1000).toLocaleDateString()}
              </small>
            </div>
          </div>
        </div>
      </div>
    `).join("");

  } catch (err) {
    console.error(err);
    document.getElementById("loading").innerHTML = '<p class="text-danger">Failed to load loved tracks</p>';
  }
}

loadLovedTracks();
