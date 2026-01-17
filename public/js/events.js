async function loadEvents() {
  try {
    const res = await fetch("/api/events");
    const events = await res.json();
    const container = document.getElementById("events-grid");
    const loading = document.getElementById("loading");

    loading.style.display = "none";

    if (!events.length) {
      container.innerHTML = '<div class="col-12 text-center text-gray">No events found. Try syncing!</div>';
      return;
    }

    container.innerHTML = events.map(e => `
      <div class="col-md-6 col-lg-4">
        <div class="card bg-light text-white shadow-sm h-100">
          <img src="${e.image || '/images/default-event.png'}" class="card-img-top" alt="${e.title}" 
               style="height: 200px; object-fit: cover;">
          <div class="card-body">
            <h5 class="card-title text-truncate" title="${e.title}">${e.title}</h5>
            <p class="card-text text-gray mb-2">
              <i class="mdi mdi-account-music text-green"></i> ${e.artists}
            </p>
            <p class="card-text text-gray mb-2">
              <i class="mdi mdi-map-marker text-green"></i> ${e.venue}
            </p>
            <p class="card-text">
              <i class="mdi mdi-calendar text-green"></i> ${new Date(e.start_date).toDateString()}
            </p>
            <a href="${e.url}" target="_blank" class="btn btn-sm btn-outline-success w-100 mt-2">
              View Event
            </a>
          </div>
        </div>
      </div>
    `).join("");

  } catch (err) {
    console.error(err);
    document.getElementById("loading").innerHTML = '<p class="text-danger">Failed to load events</p>';
  }
}

loadEvents();
