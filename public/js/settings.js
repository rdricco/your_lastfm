document.addEventListener("DOMContentLoaded", async () => {
  const form = document.getElementById("settings-form");
  const usernameInput = document.getElementById("lastfm-username");
  const apiKeyInput = document.getElementById("lastfm-api-key");
  const avgTrackInput = document.getElementById("avg-track-seconds");
  const toggleKeyBtn = document.getElementById("toggle-key");

  // Load current settings
  try {
    const res = await fetch("/api/settings");
    const data = await res.json();
    
    if (data.LASTFM_USERNAME) usernameInput.value = data.LASTFM_USERNAME;
    if (data.AVG_TRACK_SECONDS) avgTrackInput.value = data.AVG_TRACK_SECONDS;
    if (data.LASTFM_API_KEY) apiKeyInput.setAttribute("placeholder", "●●●●●●●●");
    
  } catch (err) {
    console.error("Failed to load settings", err);
  }

  // Toggle Password Visibility
  toggleKeyBtn.addEventListener("click", () => {
    const type = apiKeyInput.getAttribute("type") === "password" ? "text" : "password";
    apiKeyInput.setAttribute("type", type);
    toggleKeyBtn.innerHTML = type === "password" ? '<i class="mdi mdi-eye"></i>' : '<i class="mdi mdi-eye-off"></i>';
  });

  // Save Settings
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    
    const payload = {
      LASTFM_USERNAME: usernameInput.value.trim(),
      AVG_TRACK_SECONDS: Number(avgTrackInput.value),
      LASTFM_API_KEY: apiKeyInput.value.trim() || undefined // undefined so JSON.stringify skips it? No, we need explicit undefined handling or just let it send empty string if user cleared it? 
      // API expects key only if we want to update it.
    };
    
    // Explicitly handle empty string vs undefined
    if (!apiKeyInput.value) delete payload.LASTFM_API_KEY;

    try {
      const res = await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      
      if (res.ok) {
        showToast("Settings saved successfully!", "success");
        setTimeout(() => apiKeyInput.value = "", 100); // clear if successful to re-show placeholder logic implicitly? Or just keep it.
      } else {
        showToast("Failed to save settings.", "danger");
      }
    } catch (err) {
      console.error(err);
      showToast("Network error.", "danger");
    }
  });

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
    }, 3000);
  }
});
