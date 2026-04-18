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
  if (parts.length >= 4) {
    try {
      return decodeURIComponent(parts.slice(3).join("__"));
    } catch {
      return parts.slice(3).join("__");
    }
  }
  if (parts.length >= 3) {
    try {
      return decodeURIComponent(parts.slice(2).join("__"));
    } catch {
      return parts.slice(2).join("__");
    }
  }
  if (parts.length >= 2) {
    try {
      return decodeURIComponent(parts[1]);
    } catch {
      return parts[1];
    }
  }
  return base;
}

function getUploaderFromPath(path) {
  const fileName = getFileNameFromPath(path);
  const parts = fileName.replace(/\.[^/.]+$/i, "").split("__");
  if (parts.length >= 4) {
    try {
      return decodeURIComponent(parts[2]);
    } catch {
      return parts[2];
    }
  }
  return "";
}

function getCategoryFromPath(path) {
  const fileName = getFileNameFromPath(path);
  const fileParts = fileName.replace(/\.[^/.]+$/i, "").split("__");
  if (fileParts.length >= 4) {
    try {
      const category = decodeURIComponent(fileParts[1]);
      return category === "nocategory" ? "" : category;
    } catch {
      return fileParts[1] === "nocategory" ? "" : fileParts[1];
    }
  }
  if (fileParts.length >= 3) {
    try {
      return decodeURIComponent(fileParts[1]);
    } catch {
      return fileParts[1];
    }
  }

  const parts = path.split("/");
  if (parts.length >= 2) {
    const first = parts[0];
    if (first === "uploads" && parts.length >= 3) {
      try {
        return decodeURIComponent(parts[1]);
      } catch {
        return parts[1];
      }
    }
    try {
      return decodeURIComponent(first);
    } catch {
      return first;
    }
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

    const uploaderInfo = sound.uploader ? document.createElement("p") : null;
    if (uploaderInfo) {
      uploaderInfo.className = "sound-uploader";
      uploaderInfo.textContent = `Geüpload door ${sound.uploader}`;
    }

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
    if (uploaderInfo) {
      card.append(image, metaRow, uploaderInfo, playBtn, actions);
    } else {
      card.append(image, metaRow, playBtn, actions);
    }
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
  } catch (e) {
    console.error("Afspelen mislukt:", e, "URL:", sound.audio.src);
    setStatus(`Afspelen mislukt: ${e.message || "Onbekende fout"}. Controleer console voor details.`);
  }
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
  console.log("Deleting storage paths:", paths);
  const { error } = await supabaseClient.storage.from(supabaseBucket).remove(paths);
  if (error) {
    console.error("Delete error:", error);
    setStatus(`Verwijderen mislukt: ${error.message}`);
    return;
  }
  setStatus(`Verwijderd: ${sound.name}`);
  await loadSounds();
}

async function loadSounds() {
  setStatus("Sounds laden...");

  const [audioResult, coverResult] = await Promise.all([
    supabaseClient.storage.from(supabaseBucket).list("uploads", { limit: 1000, sortBy: { column: "name", order: "asc" } }),
    supabaseClient.storage.from(supabaseBucket).list("covers", { limit: 1000, sortBy: { column: "name", order: "asc" } }),
  ]);

  if (audioResult.error) {
    setStatus(`Laden mislukt: ${audioResult.error.message}`);
    return;
  }

  const knownCategories = new Set();
  const savedCategories = localStorage.getItem("soundboard-categories");
  if (savedCategories) {
    try {
      JSON.parse(savedCategories).forEach((cat) => knownCategories.add(cat));
    } catch {}
  }
  (audioResult.data || []).forEach((item) => {
    const category = getCategoryFromPath(item.name);
    if (category) knownCategories.add(category);
  });

  categoriesSet.clear();
  knownCategories.forEach((cat) => categoriesSet.add(cat));
  localStorage.setItem("soundboard-categories", JSON.stringify(Array.from(categoriesSet)));
  updateCategoryDropdown();

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
        uploader: getUploaderFromPath(fileName),
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

async function loadCategories() {
  const knownCategories = new Set();
  const savedCategories = localStorage.getItem("soundboard-categories");
  if (savedCategories) {
    try {
      JSON.parse(savedCategories).forEach((cat) => knownCategories.add(cat));
    } catch {}
  }

  const folderResult = await supabaseClient.storage.from(supabaseBucket).list("uploads", { limit: 100, folderMode: "folders" });
  if (!folderResult.error && folderResult.data) {
    folderResult.data.forEach((item) => {
      if (item.name) {
        knownCategories.add(item.name);
      }
    });
  }

  const fileResult = await supabaseClient.storage.from(supabaseBucket).list("uploads", { limit: 1000, sortBy: { column: "name", order: "asc" } });
  if (!fileResult.error && fileResult.data) {
    fileResult.data.forEach((item) => {
      const category = getCategoryFromPath(item.name);
      if (category) knownCategories.add(category);
    });
  }

  categoriesSet.clear();
  knownCategories.forEach((cat) => categoriesSet.add(cat));
  localStorage.setItem("soundboard-categories", JSON.stringify(Array.from(categoriesSet)));
  updateCategoryDropdown();
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
  const confirmBtn = getById("confirmUploadBtn");
  if (!audioInput || !confirmBtn) return;

  if (!validateUploadFiles()) return;

  const mediaFile = audioInput.files?.[0];
  const imageFile = imageInput?.files?.[0] || null;
  if (!mediaFile) {
    setStatus("Kies eerst audio of video.");
    return;
  }

  const cleanName = (nameInput?.value.trim() || mediaFile.name.replace(/\.[^/.]+$/i, "")).slice(0, 40);
  const soundId = crypto.randomUUID();
  const encodedName = encodeURIComponent(cleanName);
  const mediaExt = (mediaFile.name.split(".").pop() || "bin").toLowerCase();
  const audioPath = `uploads/${soundId}__${encodedName}.${mediaExt}`;

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
  
  categoriesSet.add(newCategory);
  localStorage.setItem("soundboard-categories", JSON.stringify(Array.from(categoriesSet)));
  updateCategoryDropdown();
  if (categorySelect) {
    categorySelect.value = newCategory;
  }
  if (newCategoryInput) {
    newCategoryInput.value = "";
  }
  renderCategoryFilter();
  setStatus(`Categorie "${newCategory}" toegevoegd!`);
}

async function handleRemoveCategory() {
  const categorySelect = getById("categorySelect");
  if (!categorySelect) return;

  const category = categorySelect.value.trim();
  if (!category) {
    setStatus("Selecteer eerst een categorie om te verwijderen.");
    return;
  }
  if (!categoriesSet.has(category)) {
    setStatus("Deze categorie bestaat niet.");
    return;
  }

  const confirmed = window.confirm(`Weet je zeker dat je categorie "${category}" en alle bijbehorende sounds wilt verwijderen?`);
  if (!confirmed) return;

  await removeCategory(category);
}

async function removeCategory(category) {
  const encodedCategory = encodeURIComponent(category);
  const categoryPath = `uploads/${encodedCategory}`;
  setStatus(`Categorie "${category}" wordt verwijderd...`);

  const uploadsResult = await supabaseClient.storage.from(supabaseBucket).list("uploads", { limit: 1000, sortBy: { column: "name", order: "asc" } });
  if (uploadsResult.error) {
    setStatus(`Kan categorie niet laden: ${uploadsResult.error.message}`);
    return;
  }

  const audioPaths = (uploadsResult.data || [])
    .filter((item) => getCategoryFromPath(item.name) === category)
    .map((item) => `uploads/${item.name}`);

  const coverPaths = [];
  const soundIds = audioPaths.map((path) => getSoundIdFromFileName(getFileNameFromPath(path)));
  if (soundIds.length > 0) {
    const coversResult = await supabaseClient.storage.from(supabaseBucket).list("covers", { limit: 1000, sortBy: { column: "name", order: "asc" } });
    if (!coversResult.error) {
      (coversResult.data || []).forEach((item) => {
        const coverSoundId = getSoundIdFromFileName(item.name);
        if (soundIds.includes(coverSoundId)) {
          coverPaths.push(`covers/${item.name}`);
        }
      });
    }
  }

  const deletePaths = [...audioPaths, ...coverPaths];
  if (deletePaths.length > 0) {
    const { error } = await supabaseClient.storage.from(supabaseBucket).remove(deletePaths);
    if (error) {
      setStatus(`Verwijderen mislukt: ${error.message}`);
      return;
    }
  }

  categoriesSet.delete(category);
  localStorage.setItem("soundboard-categories", JSON.stringify(Array.from(categoriesSet)));
  updateCategoryDropdown();
  renderCategoryFilter();
  setStatus(`Categorie "${category}" verwijderd.`);
  await loadSounds();
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

  const savedCategories = localStorage.getItem("soundboard-categories");
  if (savedCategories) {
    try {
      JSON.parse(savedCategories).forEach((cat) => categoriesSet.add(cat));
    } catch {}
  }
}

function saveFavorites() {
  localStorage.setItem("soundboard-favorites", JSON.stringify(Array.from(favoritesSet)));
}

function saveVolume(value) {
  localStorage.setItem("soundboard-volume", value);
}

function unregisterServiceWorkers() {
  if (!("serviceWorker" in navigator)) return;

  navigator.serviceWorker.getRegistrations().then((registrations) => {
    registrations.forEach((registration) => {
      registration.unregister();
    });
  }).catch((error) => {
    console.error("Service worker unregister failed:", error);
  });
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
  if (!confirmBtn) return;

  confirmBtn.addEventListener("click", () => uploadSingleSound());
  audioInput?.addEventListener("change", validateUploadFiles);
  imageInput?.addEventListener("change", validateUploadFiles);
}

function boot() {
  if (!supabaseUrl || !supabaseAnonKey || supabaseUrl.includes("VUL_HIER")) {
    setStatus("Supabase configuratie ontbreekt.");
    return;
  }
  supabaseClient = window.supabase.createClient(supabaseUrl, supabaseAnonKey);
  loadSavedSettings();
  unregisterServiceWorkers();
  wireLibraryEvents();
  wireUploadEvents();
  if (getById("soundGrid")) {
    loadSounds();
  }
}

boot();
