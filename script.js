const supabaseUrl = window.SUPABASE_URL;
const supabaseAnonKey = window.SUPABASE_ANON_KEY;
const supabaseBucket = window.SUPABASE_BUCKET || "sounds";
const mediaExtensions = new Set(["mp3", "m4a", "wav", "aac", "ogg", "mp4", "mov", "m4v", "webm"]);

const maxAudioSizeBytes = 20 * 1024 * 1024;
const maxVideoSizeBytes = 60 * 1024 * 1024;
const maxImageSizeBytes = 5 * 1024 * 1024;

const sounds = [];
let currentAudio = null;
let supabaseClient = null;
const favoritesSet = new Set();
const categoriesSet = new Set();
let currentCategory = "";

// Recent sounds tracking
const recentSounds = [];
const MAX_RECENT = 5;

// Category emojis map
const categoryEmojis = {
  "memes": "😂",
  "gaming": "🎮",
  "feest": "🎉",
  "vlog": "📢",
  "reactie": "💬",
  "nieuws": "📰",
  " defaults": "🔊"
};

function getById(id) {
  return document.getElementById(id);
}

function setStatus(text) {
  const el = getById("statusMessage");
  if (el) el.textContent = text;
}

function getPublicUrl(storagePath) {
  const { data } = supabaseClient.storage.from(supabaseBucket).getPublicUrl(storagePath);
  return data.publicUrl;
}

function getSoundIdFromFileName(fileName) {
  return fileName.split("__")[0] || "";
}

function getSoundNameFromFileName(fileName) {
  const base = fileName.replace(/\.[^/.]+$/i, "");
  const parts = base.split("__");
  if (parts.length >= 2) {
    try {
      return decodeURIComponent(parts[1]);
    } catch {
      return parts[1];
    }
  }
  return base;
}

function getCategoryFromPath(path) {
  // Path format: "memes/airhorn__soundid.mp3" -> "memes"
  const parts = path.split("/");
  if (parts.length >= 2) {
    return parts[0];
  }
  return "";
}

function getFileNameFromPath(path) {
  // Path format: "memes/airhorn__soundid.mp3" -> "airhorn__soundid.mp3"
  const parts = path.split("/");
  return parts[parts.length - 1] || path;
}

function getMediaTypeFromFileName(fileName) {
  const extension = (fileName.split(".").pop() || "").toLowerCase();
  if (new Set(["mp4", "mov", "m4v", "webm"]).has(extension)) {
    return "Video";
  }
  return "Audio";
}

function isSupportedMediaFile(file) {
  const extension = (file.name.split(".").pop() || "").toLowerCase();
  return file.type.startsWith("audio/") || file.type.startsWith("video/") || mediaExtensions.has(extension);
}

function isVideoMediaFile(file) {
  return file.type.startsWith("video/") || new Set(["mp4", "mov", "m4v", "webm"]).has((file.name.split(".").pop() || "").toLowerCase());
}

function pauseAllSounds() {
  sounds.forEach((sound) => {
    sound.audio.pause();
    sound.audio.currentTime = 0;
  });
}

function resetPlayButtons() {
  document.querySelectorAll(".play-btn").forEach((btn) => {
    btn.textContent = "▶";
  });
}

function renderLibrary() {
  const grid = getById("soundGrid");
  if (!grid) return;

  const searchValue = (getById("searchInput")?.value || "").trim().toLowerCase();
  const categoryFilter = getById("categoryFilter")?.value || currentCategory;
  
  let visibleSounds = sounds;
  
  // Filter by search
  if (searchValue) {
    visibleSounds = visibleSounds.filter((sound) => sound.name.toLowerCase().includes(searchValue));
  }
  
  // Filter by category
  if (categoryFilter) {
    visibleSounds = visibleSounds.filter((sound) => sound.category === categoryFilter);
  }
  
  visibleSounds = visibleSounds.sort((a, b) => a.name.localeCompare(b.name));

  grid.innerHTML = "";
  if (visibleSounds.length === 0) {
    const empty = document.createElement("p");
    empty.className = "empty-state";
    empty.textContent = categoryFilter ? "Geen sounds in deze categorie." : "Nog geen sounds gevonden. Upload er eentje om te beginnen.";
    grid.appendChild(empty);
    return;
  }

  visibleSounds.forEach((sound) => {
    const card = document.createElement("article");
    card.className = "sound-card";

    const image = document.createElement("img");
    image.className = "sound-image";
    image.src = sound.imageUrl || "https://placehold.co/64x64/f6d4cd/8a4f45?text=%F0%9F%94%8A";
    image.alt = `${sound.name} afbeelding`;

    const metaRow = document.createElement("div");
    metaRow.className = "sound-meta";

    const title = document.createElement("p");
    title.className = "sound-title";
    title.textContent = sound.name;

    const typeBadge = document.createElement("span");
    typeBadge.className = "sound-type";
    typeBadge.textContent = sound.typeLabel;

    metaRow.append(title, typeBadge);

    const playBtn = document.createElement("button");
    playBtn.className = "play-btn";
    playBtn.type = "button";
    playBtn.textContent = "▶";
    playBtn.addEventListener("click", async () => {
      await playSound(sound, playBtn);
    });

    const actions = document.createElement("div");
    actions.className = "small-actions";

    const favoriteBtn = document.createElement("button");
    favoriteBtn.className = `favorite-btn${sound.favorite ? " active" : ""}`;
    favoriteBtn.type = "button";
    favoriteBtn.textContent = sound.favorite ? "★ Favoriet" : "☆ Favoriet";
    favoriteBtn.addEventListener("click", () => toggleFavorite(sound));

    const pauseBtn = document.createElement("button");
    pauseBtn.className = "small-btn";
    pauseBtn.type = "button";
    pauseBtn.textContent = "Pause";
    pauseBtn.addEventListener("click", () => {
      sound.audio.pause();
      if (currentAudio === sound.audio) currentAudio = null;
      resetPlayButtons();
    });

    const deleteBtn = document.createElement("button");
    deleteBtn.className = "small-btn delete";
    deleteBtn.type = "button";
    deleteBtn.textContent = "Delete";
    deleteBtn.addEventListener("click", () => deleteSound(sound));

    actions.append(favoriteBtn, pauseBtn, deleteBtn);
    card.append(image, metaRow, playBtn, actions);
    grid.appendChild(card);
    sound.playButton = playBtn;
  });
}

async function playSound(sound, playBtn) {
  const isPlaying = currentAudio === sound.audio && !sound.audio.paused;
  pauseAllSounds();
  resetPlayButtons();

  if (isPlaying) {
    currentAudio = null;
    return;
  }

  try {
    sound.audio.volume = Number(getById("globalVolume")?.value || 1);
    await sound.audio.play();
    currentAudio = sound.audio;
    if (playBtn) playBtn.textContent = "❚❚";
    
    // Add to recent sounds
    addToRecent(sound);
  } catch (e) {
    console.error("Afspelen mislukt:", e, "URL:", sound.audio.src);
    setStatus(`Afspelen mislukt: ${e.message || "Onbekende fout"}. Controleer console voor details.`);
  }
}

function addToRecent(sound) {
  // Remove if already exists
  const existingIndex = recentSounds.findIndex(s => s.soundId === sound.soundId);
  if (existingIndex >= 0) {
    recentSounds.splice(existingIndex, 1);
  }
  // Add to beginning
  recentSounds.unshift(sound);
  // Keep only MAX_RECENT
  while (recentSounds.length > MAX_RECENT) {
    recentSounds.pop();
  }
  renderRecentSounds();
  saveRecentSounds();
}

function renderRecentSounds() {
  const recentGrid = getById("recentGrid");
  const recentSection = getById("recentSection");
  if (!recentGrid || !recentSection) return;

  if (recentSounds.length === 0) {
    recentSection.hidden = true;
    recentGrid.innerHTML = "";
    return;
  }

  recentSection.hidden = false;
  recentGrid.innerHTML = "";

  recentSounds.forEach((sound) => {
    const card = document.createElement("article");
    card.className = "sound-card sound-card-recent";

    const image = document.createElement("img");
    image.className = "sound-image";
    image.src = sound.imageUrl || "https://placehold.co/64x64/f6d4cd/8a4f45?text=%F0%9F%94%8A";
    image.alt = `${sound.name} afbeelding`;

    const title = document.createElement("p");
    title.className = "sound-title";
    title.textContent = sound.name;

    const playBtn = document.createElement("button");
    playBtn.className = "play-btn";
    playBtn.type = "button";
    playBtn.textContent = "▶";
    playBtn.addEventListener("click", async () => {
      await playSound(sound, playBtn);
    });

    card.append(image, title, playBtn);
    recentGrid.appendChild(card);
  });
}

function saveRecentSounds() {
  const ids = recentSounds.map(s => s.soundId);
  localStorage.setItem("soundboard-recent", JSON.stringify(ids));
}

function loadRecentSounds() {
  const saved = localStorage.getItem("soundboard-recent");
  if (!saved) return;
  try {
    const ids = JSON.parse(saved);
    ids.forEach(id => {
      const sound = sounds.find(s => s.soundId === id);
      if (sound) recentSounds.push(sound);
    });
  } catch {}
}

function getCategoryEmoji(category) {
  if (!category) return "📁";
  return categoryEmojis[category.toLowerCase()] || "📁";
}

function toggleFavorite(sound) {
  sound.favorite = !sound.favorite;
  if (sound.favorite) {
    favoritesSet.add(sound.soundId);
    setStatus(`Favoriet toegevoegd: ${sound.name}`);
  } else {
    favoritesSet.delete(sound.soundId);
    setStatus(`Favoriet verwijderd: ${sound.name}`);
  }
  saveFavorites();
  renderLibrary();
}

async function deleteSound(sound) {
  pauseAllSounds();
  const paths = [sound.audioPath];
  if (sound.imagePath) paths.push(sound.imagePath);
  const { error } = await supabaseClient.storage.from(supabaseBucket).remove(paths);
  if (error) {
    setStatus(`Verwijderen mislukt: ${error.message}`);
    return;
  }
  const index = sounds.findIndex((item) => item.id === sound.id);
  if (index >= 0) sounds.splice(index, 1);
  renderLibrary();
  setStatus(`Verwijderd: ${sound.name}`);
}

async function loadSounds() {
  setStatus("Sounds laden...");
  
  // First, get list of folders (categories) from uploads
  const foldersResult = await supabaseClient.storage.from(supabaseBucket).list("", { limit: 100, folderMode: "folders" });
  
  const knownCategories = new Set();
  if (foldersResult.data) {
    foldersResult.data.forEach((item) => {
      if (item.name && item.name !== "uploads" && item.name !== "covers") {
        knownCategories.add(item.name);
      }
    });
  }

  // Also add any saved categories from localStorage
  const savedCategories = localStorage.getItem("soundboard-categories");
  if (savedCategories) {
    try {
      JSON.parse(savedCategories).forEach((cat) => knownCategories.add(cat));
    } catch {}
  }

  // Rebuild categoriesSet
  categoriesSet.clear();
  knownCategories.forEach((cat) => categoriesSet.add(cat));
  updateCategoryDropdown();

  const [audioResult, coverResult] = await Promise.all([
    supabaseClient.storage.from(supabaseBucket).list("uploads", { limit: 1000, sortBy: { column: "name", order: "asc" } }),
    supabaseClient.storage.from(supabaseBucket).list("covers", { limit: 1000, sortBy: { column: "name", order: "asc" } }),
  ]);

  if (audioResult.error) {
    setStatus(`Laden mislukt: ${audioResult.error.message}`);
    return;
  }

  const coverById = new Map();
  (coverResult.data || []).forEach((item) => {
    const fullPath = item.name.includes("/") ? item.name : `covers/${item.name}`;
    const soundId = getSoundIdFromFileName(item.name);
    coverById.set(soundId, fullPath);
  });

  sounds.length = 0;
  (audioResult.data || [])
    .filter((item) => mediaExtensions.has((item.name.split(".").pop() || "").toLowerCase()))
    .forEach((item) => {
      const category = getCategoryFromPath(item.name);
      const fileName = getFileNameFromPath(item.name);
      const soundId = getSoundIdFromFileName(fileName);
      const audioPath = `uploads/${item.name}`;
      const imagePath = coverById.get(soundId) || null;
      
      const audio = new Audio(getPublicUrl(audioPath));
      console.log("Audio URL:", audio.src, "voor", audioPath);
      audio.setAttribute("playsinline", "true");
      audio.preload = "metadata";

      const sound = {
        id: crypto.randomUUID(),
        soundId,
        name: getSoundNameFromFileName(fileName),
        category: category,
        audioPath,
        imagePath,
        imageUrl: imagePath ? getPublicUrl(imagePath) : null,
        audio,
        typeLabel: getMediaTypeFromFileName(fileName),
        favorite: favoritesSet.has(soundId),
      };

      audio.onended = () => {
        if (currentAudio === audio) currentAudio = null;
        if (sound.playButton) sound.playButton.textContent = "▶";
      };

      sounds.push(sound);
    });

  renderLibrary();
  setStatus(`Klaar. ${sounds.length} sounds geladen.`);
}

function updateCategoryDropdown() {
  const select = getById("categorySelect");
  if (!select) return;
  
  // Save currently selected
  const currentValue = select.value;
  
  select.innerHTML = `<option value="">Geen categorie</option>`;
  categoriesSet.forEach((cat) => {
    const option = document.createElement("option");
    option.value = cat;
    option.textContent = cat;
    select.appendChild(option);
  });
  
  // Restore selection if still exists
  if (currentValue && categoriesSet.has(currentValue)) {
    select.value = currentValue;
  }
}

function renderCategoryFilter() {
  const searchInput = getById("searchInput");
  if (!searchInput) return;
  
  // Add category filter dropdown next to search
  let filterSelect = getById("categoryFilter");
  if (!filterSelect) {
    filterSelect = document.createElement("select");
    filterSelect.id = "categoryFilter";
    filterSelect.className = "category-filter";
    filterSelect.innerHTML = `<option value="">Alle categorieën</option>`;
    
    filterSelect.addEventListener("change", () => {
      currentCategory = filterSelect.value;
      renderLibrary();
    });
    
    // Insert after search input
    searchInput.parentNode?.insertBefore(filterSelect, searchInput.nextSibling);
  }
  
  // Update options
  const currentValue = filterSelect.value;
  filterSelect.innerHTML = `<option value="">Alle categorieën</option>`;
  categoriesSet.forEach((cat) => {
    const option = document.createElement("option");
    option.value = cat;
    option.textContent = cat;
    filterSelect.appendChild(option);
  });
  filterSelect.value = currentValue;
}

function setUploadProgress(percent) {
  const progressContainer = getById("uploadProgressContainer");
  const progressBar = getById("uploadProgressBar");
  if (!progressContainer || !progressBar) return;
  progressContainer.hidden = false;
  progressBar.style.width = `${percent}%`;
}

function resetUploadProgress() {
  const progressContainer = getById("uploadProgressContainer");
  const progressBar = getById("uploadProgressBar");
  if (!progressContainer || !progressBar) return;
  progressContainer.hidden = true;
  progressBar.style.width = "0%";
}

function validateUploadFiles() {
  const audioInput = getById("audioUpload");
  const imageInput = getById("imageUpload");
  const mediaFile = audioInput?.files?.[0];
  const imageFile = imageInput?.files?.[0] || null;

  if (!mediaFile) {
    setStatus("Kies eerst audio of video.");
    return false;
  }
  if (!isSupportedMediaFile(mediaFile)) {
    setStatus("Alleen audio/video bestanden zijn toegestaan.");
    return false;
  }

  const isVideo = isVideoMediaFile(mediaFile);
  if (isVideo && mediaFile.size > maxVideoSizeBytes) {
    setStatus("Video is te groot (max 60MB).");
    return false;
  }
  if (!isVideo && mediaFile.size > maxAudioSizeBytes) {
    setStatus("Audio is te groot (max 20MB).");
    return false;
  }
  if (imageFile && (!imageFile.type.startsWith("image/") || imageFile.size > maxImageSizeBytes)) {
    setStatus("Foto ongeldig of te groot (max 5MB).");
    return false;
  }

  setStatus("");
  return true;
}

async function uploadSingleSound() {
  const audioInput = getById("audioUpload");
  const imageInput = getById("imageUpload");
  const nameInput = getById("soundNameInput");
  const categorySelect = getById("categorySelect");
  const newCategoryInput = getById("newCategoryInput");
  const confirmBtn = getById("confirmUploadBtn");
  if (!audioInput || !confirmBtn) return;

  if (!validateUploadFiles()) return;

  const mediaFile = audioInput.files?.[0];
  const imageFile = imageInput?.files?.[0] || null;
  if (!mediaFile) {
    setStatus("Kies eerst audio of video.");
    return;
  }

  // Get selected category or new category
  let category = categorySelect?.value || "";
  const newCategory = newCategoryInput?.value?.trim() || "";
  
  if (newCategory) {
    // Add new category
    category = newCategory;
    categoriesSet.add(category);
    localStorage.setItem("soundboard-categories", JSON.stringify(Array.from(categoriesSet)));
  }

  const cleanName = (nameInput?.value.trim() || mediaFile.name.replace(/\.[^/.]+$/i, "")).slice(0, 40);
  const soundId = crypto.randomUUID();
  const encodedName = encodeURIComponent(cleanName);
  const mediaExt = (mediaFile.name.split(".").pop() || "bin").toLowerCase();
  
  // Use category folder if selected
  const folderPrefix = category ? `${category}/` : "";
  const audioPath = `uploads/${folderPrefix}${soundId}__${encodedName}.${mediaExt}`;

  confirmBtn.disabled = true;
  resetUploadProgress();
  setUploadProgress(10);
  setStatus("Uploaden...");

  const audioUploadResult = await supabaseClient.storage.from(supabaseBucket).upload(audioPath, mediaFile, {
    contentType: mediaFile.type || "application/octet-stream",
    upsert: false,
  });
  if (audioUploadResult.error) {
    confirmBtn.disabled = false;
    setStatus(`Upload mislukt: ${audioUploadResult.error.message}`);
    return;
  }

  setUploadProgress(55);

  if (imageFile) {
    const imageExt = (imageFile.name.split(".").pop() || "jpg").toLowerCase();
    const imagePath = `covers/${soundId}__${encodedName}.${imageExt}`;
    const imageUploadResult = await supabaseClient.storage.from(supabaseBucket).upload(imagePath, imageFile, {
      contentType: imageFile.type || "image/jpeg",
      upsert: false,
    });
    if (imageUploadResult.error) {
      await supabaseClient.storage.from(supabaseBucket).remove([audioPath]);
      confirmBtn.disabled = false;
      setStatus(`Foto upload mislukt: ${imageUploadResult.error.message}`);
      return;
    }
    setUploadProgress(85);
  }

  setUploadProgress(100);
  setStatus("Upload gelukt! Je gaat nu terug naar de sounds.");
  setTimeout(() => {
    window.location.href = "index.html";
  }, 850);
}

function handleAddCategory() {
  const newCategoryInput = getById("newCategoryInput");
  const categorySelect = getById("categorySelect");
  const newCategory = newCategoryInput?.value?.trim();
  
  if (!newCategory) {
    setStatus("Voer een naam in voor de nieuwe categorie.");
    return;
  }
  
  if (categoriesSet.has(newCategory)) {
    setStatus("Deze categorie bestaat al.");
    return;
  }
  
  // Add to set and save
  categoriesSet.add(newCategory);
  localStorage.setItem("soundboard-categories", JSON.stringify(Array.from(categoriesSet)));
  
  // Update dropdown
  updateCategoryDropdown();
  
  // Select the new category
  if (categorySelect) {
    categorySelect.value = newCategory;
  }
  
  // Clear input
  if (newCategoryInput) {
    newCategoryInput.value = "";
  }
  
  setStatus(`Categorie "${newCategory}" toegevoegd!`);
}

function loadSavedSettings() {
  const savedVolume = localStorage.getItem("soundboard-volume");
  if (savedVolume !== null && getById("globalVolume")) {
    const volumeEl = getById("globalVolume");
    volumeEl.value = savedVolume;
    const pct = Math.round(Number(savedVolume) * 100);
    const volumeElText = getById("volumeValue");
    if (volumeElText) volumeElText.textContent = `${pct}%`;
  }

  const savedFavorites = localStorage.getItem("soundboard-favorites");
  if (savedFavorites) {
    try {
      JSON.parse(savedFavorites).forEach((id) => favoritesSet.add(id));
    } catch {
      favoritesSet.clear();
    }
  }
}

function saveFavorites() {
  localStorage.setItem("soundboard-favorites", JSON.stringify(Array.from(favoritesSet)));
}

function saveVolume(value) {
  localStorage.setItem("soundboard-volume", value);
}

function showUpdateBanner() {
  const banner = getById("updateBanner");
  if (banner) banner.hidden = false;
}

function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) return;

  navigator.serviceWorker.register("sw.js").then((registration) => {
    if (registration.waiting) {
      showUpdateBanner();
    }

    registration.addEventListener("updatefound", () => {
      const newWorker = registration.installing;
      if (!newWorker) return;
      newWorker.addEventListener("statechange", () => {
        if (newWorker.state === "installed" && navigator.serviceWorker.controller) {
          showUpdateBanner();
        }
      });
    });
  });

  navigator.serviceWorker.addEventListener("controllerchange", () => {
    window.location.reload();
  });
}

function wireLibraryEvents() {
  getById("searchInput")?.addEventListener("input", () => renderLibrary());
  getById("globalVolume")?.addEventListener("input", (event) => {
    const volume = Number(event.target.value);
    const pct = Math.round(volume * 100);
    const volumeEl = getById("volumeValue");
    if (volumeEl) volumeEl.textContent = `${pct}%`;
    sounds.forEach((sound) => {
      sound.audio.volume = volume;
    });
    saveVolume(String(volume));
  });
  
  // Theme Toggle
  getById("themeToggle")?.addEventListener("click", () => {
    const html = document.documentElement;
    const isDark = html.getAttribute("data-theme") === "dark";
    if (isDark) {
      html.setAttribute("data-theme", "light");
      getById("themeToggle").textContent = "🌙";
      localStorage.setItem("soundboard-theme", "light");
    } else {
      html.setAttribute("data-theme", "dark");
      getById("themeToggle").textContent = "☀️";
      localStorage.setItem("soundboard-theme", "dark");
    }
  });
  
  // Load saved theme
  const savedTheme = localStorage.getItem("soundboard-theme");
  if (savedTheme === "dark") {
    document.documentElement.setAttribute("data-theme", "dark");
    getById("themeToggle").textContent = "☀️";
  }
  
  // Volume Presets
  document.querySelectorAll(".preset-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      const vol = btn.dataset.volume;
      const volumeEl = getById("globalVolume");
      if (volumeEl && vol) {
        volumeEl.value = vol;
        volumeEl.dispatchEvent(new Event("input"));
      }
    });
  });
  
  // Random Sound knop
  getById("randomBtn")?.addEventListener("click", () => {
    if (sounds.length === 0) {
      setStatus("Nog geen sounds om te kiezen.");
      return;
    }
    const randomIndex = Math.floor(Math.random() * sounds.length);
    const randomSound = sounds[randomIndex];
    const btn = randomSound.playButton;
    playSound(randomSound, btn);
  });
  
  // Keyboard shortcuts (1-9)
  document.addEventListener("keydown", (e) => {
    // Only if not in input field
    if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA") return;
    
    const key = e.key;
    if (key >= "1" && key <= "9") {
      const index = parseInt(key) - 1;
      if (sounds[index]) {
        const btn = sounds[index].playButton;
        playSound(sounds[index], btn);
      }
    }
  });
  
  getById("refreshBtn")?.addEventListener("click", () => {
    if (navigator.serviceWorker.controller) {
      navigator.serviceWorker.controller.postMessage({ type: "SKIP_WAITING" });
    }
    window.location.reload();
  });
}

function wireUploadEvents() {
  const confirmBtn = getById("confirmUploadBtn");
  const audioInput = getById("audioUpload");
  const imageInput = getById("imageUpload");
  const addCategoryBtn = getById("addCategoryBtn");
  if (!confirmBtn) return;

  confirmBtn.addEventListener("click", () => uploadSingleSound());
  audioInput?.addEventListener("change", validateUploadFiles);
  imageInput?.addEventListener("change", validateUploadFiles);
  addCategoryBtn?.addEventListener("click", () => handleAddCategory());
}

function boot() {
  if (!supabaseUrl || !supabaseAnonKey || supabaseUrl.includes("VUL_HIER")) {
    setStatus("Supabase configuratie ontbreekt.");
    return;
  }
  supabaseClient = window.supabase.createClient(supabaseUrl, supabaseAnonKey);
  loadSavedSettings();
  registerServiceWorker();
  wireLibraryEvents();
  wireUploadEvents();
  if (getById("soundGrid")) {
    loadSounds();
    renderCategoryFilter();
  }
}

boot();
