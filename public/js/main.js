import { initFilters } from "./filters.js";
import { loadSummary } from "./summary.js";
import { loadAlbums } from "./albums.js";
import { loadChart } from "./charts.js";
import { loadTopSongs } from "./topSongs.js";
import { loadTopArtists } from "./artists.js";
import { loadScrobbles } from "./scrobbles.js";

const UI = {
  loading: document.getElementById("global-loading"),
  scrobblesView: document.getElementById("scrobbles-view"),
  dashboardSections: Array.from(document.querySelectorAll("main > section"))
    .filter(sec => sec.id !== "scrobbles-view"),
  navButtons: document.querySelectorAll(".nav-btn")
};

const CHART_DAILY_CONFIG = {
  url: "/api/plays-per-day",
  canvasId: "daily",
  labelKey: "day",
  valueKey: "plays",
  label: "Plays per day"
};

async function reloadDashboardData() {
  UI.loading.style.display = "flex";
  
  try {
    await Promise.all([
      loadSummary(),
      loadAlbums(),
      loadTopSongs(),
      loadTopArtists(),
      loadChart(CHART_DAILY_CONFIG)
    ]);
  } catch (error) {
    console.error("Error loading dashboard:", error);
  } finally {
    UI.loading.style.display = "none";
  }
}

function toggleView(viewName) {
  const isScrobbles = viewName === "scrobbles";

  UI.navButtons.forEach(btn => 
    btn.classList.toggle("active", btn.dataset.view === viewName)
  );

  UI.scrobblesView.classList.toggle("d-none", !isScrobbles);
  UI.dashboardSections.forEach(sec => sec.classList.toggle("d-none", isScrobbles));

  if (isScrobbles) {
    loadScrobbles(true);
  }
}

UI.navButtons.forEach(btn => {
  btn.addEventListener("click", () => toggleView(btn.dataset.view));
});

initFilters(() => {
  reloadDashboardData();
});

toggleView("dashboard");
reloadDashboardData();

// Sync Logic
const syncBtn = document.getElementById("force-sync-btn");
if (syncBtn) {
  syncBtn.addEventListener("click", async () => {
    try {
      syncBtn.disabled = true;
      syncBtn.innerHTML = '<i class="mdi mdi-loading mdi-spin"></i> Syncing...';
      
      const res = await fetch("/api/sync", { method: "POST" });
      
      if (res.ok) {
        showToast("Sync started in background.", "success");
        // Poll or just wait a bit and reload? For now, let's just reload after a delay or let user reload.
        // Better: periodic check? simpler: just notify.
      } else {
        const err = await res.json();
        showToast(err.error || "Sync failed", "danger");
      }
    } catch (err) {
      console.error(err);
      showToast("Network error triggering sync", "danger");
    } finally {
      setTimeout(() => {
        syncBtn.disabled = false;
        syncBtn.innerHTML = '<i class="mdi mdi-sync text-green"></i> Force sync';
      }, 5000); // Prevent spamming
    }
  });
}

function showToast(message, type = "success") {
  const toastContainer = document.getElementById("toast-container");
  const color = type === "success" ? "bg-success" : "bg-danger";
  
  const toastHtml = `
    <div class="toast align-items-center text-white ${color} border-0 show" role="alert" aria-live="assertive" aria-atomic="true">
      <div class="d-flex">
        <div class="toast-body">
          ${message}
        </div>
        <button type="button" class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast" aria-label="Close"></button>
      </div>
    </div>
  `;
  
  toastContainer.innerHTML = toastHtml;
  setTimeout(() => {
    toastContainer.innerHTML = "";
  }, 4000);
}