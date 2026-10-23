(function () {
  const vscode = acquireVsCodeApi();
  const $ = (id) => document.getElementById(id);
  const DEFAULT_FEEDBACK = "Click a reference to insert it";
  const IS_MAC = /Mac|iPhone|iPad/.test(navigator.platform || "");

  const svg = (paths) =>
    '<svg viewBox="0 0 24 24" aria-hidden="true">' + paths + "</svg>";
  const FILE_OUTLINE =
    '<path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/>';
  const TYPE_ICONS = {
    journalArticle: svg(FILE_OUTLINE + '<path d="M10 9H8"/><path d="M16 13H8"/><path d="M16 17H8"/>'),
    preprint: svg(FILE_OUTLINE + '<path d="M10 9H8"/><path d="M16 13H8"/><path d="M16 17H8"/>'),
    book: svg('<path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/>'),
    bookSection: svg('<path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/>'),
    conferencePaper: svg('<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>'),
    thesis: svg('<path d="M22 10v6M2 10l10-5 10 5-10 5z"/><path d="M6 12v5c3 3 9 3 12 0v-5"/>'),
    webpage: svg('<circle cx="12" cy="12" r="10"/><path d="M2 12h20"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>'),
    blogPost: svg('<circle cx="12" cy="12" r="10"/><path d="M2 12h20"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>'),
    dataset: svg('<ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M3 5v14a9 3 0 0 0 18 0V5"/><path d="M3 12a9 3 0 0 0 18 0"/>'),
    computerProgram: svg('<path d="m16 18 6-6-6-6"/><path d="m8 6-6 6 6 6"/>'),
    attachment: svg('<path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l8.57-8.57A4 4 0 1 1 18 8.84l-8.59 8.57a2 2 0 0 1-2.83-2.83l8.49-8.48"/>'),
    report: svg(FILE_OUTLINE + '<path d="M8 13h2"/><path d="M8 17h8"/>'),
    warning: svg(FILE_OUTLINE + '<path d="M12 9v4"/><path d="M12 17h.01"/>'),
    document: svg(FILE_OUTLINE)
  };
  const ICON_OPEN = svg('<path d="M15 3h6v6"/><path d="M10 14 21 3"/><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>');
  const ICON_COPY = svg('<rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/>');
  const ICON_EYE = svg('<path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/>');

  let model = null;
  let lastPage = 0;

  function send(type, payload) {
    vscode.postMessage(Object.assign({ type: type }, payload || {}));
  }

  function ago(ms) {
    const minutes = Math.floor((Date.now() - ms) / 60000);
    if (minutes < 1) {
      return "just now";
    }
    if (minutes < 60) {
      return minutes + " min ago";
    }
    const hours = Math.round(minutes / 60);
    if (hours < 24) {
      return hours + " h ago";
    }
    return Math.round(hours / 24) + " d ago";
  }

  function relativeTime(ms) {
    if (!ms) {
      return "";
    }
    return Date.now() - ms < 15 * 60000 ? "Up to date" : "Synced " + ago(ms);
  }

  function fillSelect(el, options, current) {
    const signature = JSON.stringify(options);
    if (el.dataset.sig !== signature) {
      el.textContent = "";
      options.forEach(function (o) {
        const opt = document.createElement("option");
        opt.value = o.value;
        opt.textContent = o.label;
        el.appendChild(opt);
      });
      el.dataset.sig = signature;
    }
    el.value = options.some(function (o) { return o.value === current; }) ? current : "";
  }

  function syncLabel() {
    if (model.loading) {
      return model.cached ? "Cached \u00b7 syncing..." : "Syncing...";
    }
    if (model.offline) {
      return model.syncedAt ? "Offline \u00b7 synced " + ago(model.syncedAt) : "Offline";
    }
    return relativeTime(model.syncedAt);
  }

  function iconFor(item) {
    if (item.unresolved || item.needsReview) {
      return TYPE_ICONS.warning;
    }
    return TYPE_ICONS[item.itemType] || TYPE_ICONS.document;
  }

  function metaLine(item) {
    if (item.unresolved) {
      return "Not in your Zotero library \u00b7 manual or deleted";
    }
    if (item.needsReview) {
      return "Metadata unavailable \u00b7 review item";
    }
    if (item.isFile) {
      return ["Attached file", item.year].filter(Boolean).join(" \u00b7 ");
    }
    return [item.authors || "Unknown author", item.year].filter(Boolean).join(" \u00b7 ");
  }

  function actionButton(action, key, label, icon) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "icon small";
    b.dataset.action = action;
    b.dataset.key = key;
    b.title = label;
    b.setAttribute("aria-label", label + ": reference");
    b.innerHTML = icon;
    return b;
  }

  function renderRow(item) {
    const row = document.createElement("div");
    row.className = "reference-row" + (item.key === model.selectedKey ? " selected" : "");
    row.setAttribute("role", "listitem");

    const paper = document.createElement("button");
    paper.type = "button";
    paper.className = "paper" + (item.key === model.selectedKey ? " selected" : "");
    paper.dataset.key = item.key;
    paper.dataset.review = String(item.needsReview);
    paper.setAttribute(
      "aria-label",
      (item.needsReview ? "Review missing metadata: " : "Insert citation: ") + item.title
    );
    paper.title = item.needsReview ? "Open details" : "Insert citation";

    const icon = document.createElement("span");
    icon.innerHTML = iconFor(item);
    const text = document.createElement("span");
    text.className = "text";
    const title = document.createElement("span");
    title.className = "title";
    title.textContent = item.title;
    if (item.isFile && item.fileExt) {
      const tag = document.createElement("span");
      tag.className = "tag";
      tag.textContent = "." + item.fileExt;
      title.append(" ", tag);
    }
    const meta = document.createElement("span");
    meta.className = "meta" + (item.needsReview ? " warning" : "");
    meta.textContent = metaLine(item);
    text.append(title, meta);
    paper.append(icon, text);

    const actions = document.createElement("div");
    actions.className = "actions";
    if (item.url) {
      actions.append(actionButton("openWeb", item.key, "Open in Zotero", ICON_OPEN));
    }
    actions.append(actionButton("copyKey", item.key, "Copy key", ICON_COPY));
    actions.append(actionButton("details", item.key, "Preview details", ICON_EYE));

    row.append(paper, actions);
    return row;
  }

  function skeletonRow(label) {
    const row = document.createElement("div");
    row.className = "reference-row skeleton";
    row.setAttribute("aria-hidden", label ? "false" : "true");
    const bars = document.createElement("span");
    bars.className = "bars";
    const title = document.createElement("span");
    title.className = "bar wide";
    const meta = document.createElement("span");
    meta.className = "bar narrow";
    bars.append(title, meta);
    row.append(bars);
    if (label) {
      const text = document.createElement("span");
      text.className = "skeleton-label";
      text.textContent = label;
      row.append(text);
    }
    return row;
  }

  function renderList() {
    const list = $("list");
    const scroll = list.scrollTop;
    list.textContent = "";
    list.setAttribute("aria-busy", String(model.loadingRows > 0 || model.searching));

    const waiting = model.loadingRows > 0 || model.searching;
    if (model.items.length === 0 && !waiting) {
      const empty = document.createElement("div");
      empty.className = "empty";
      if (model.libraryCount === 0) {
        empty.textContent = model.loading
          ? "Loading your library..."
          : "Your Zotero library has no references yet.";
      } else if (model.filters.tab === "cited" && !model.hasEditor) {
        empty.textContent = "Open a file to see which references it cites.";
      } else if (model.filters.tab === "cited" && model.citedCount === 0) {
        empty.textContent = "No Sci2Code citations found in this file.";
      } else {
        empty.textContent = "No matching references";
      }
      list.appendChild(empty);
    }

    model.items.forEach(function (item) {
      list.appendChild(renderRow(item));
    });
    for (let i = 0; i < Math.min(model.loadingRows, 25); i++) {
      list.appendChild(skeletonRow(i === 0 ? "Loading more references..." : ""));
    }
    if (model.searching) {
      list.appendChild(skeletonRow("Searching Zotero..."));
    }

    list.scrollTop = model.page === lastPage ? scroll : 0;
    lastPage = model.page;
  }

  function renderPager() {
    const multiple = model.pageCount > 1;
    $("pager").classList.toggle("hidden", !multiple);
    if (!multiple) {
      return;
    }
    $("pageInfo").textContent =
      model.pageFrom + "\u2013" + (model.pageTo + model.loadingRows) + " of " + model.total +
      (model.loadingRows > 0 ? " \u00b7 loading..." : "");
    $("prevPage").disabled = model.page <= 0;
    $("nextPage").disabled = model.page >= model.pageCount - 1;
  }

  function renderDetails() {
    const d = model.details;
    $("preview").hidden = !d;
    if (!d) {
      return;
    }
    $("pvTitle").textContent = d.title;
    $("pvAuthors").textContent = d.unresolved
      ? "Not in your Zotero library"
      : d.needsReview
        ? "Metadata unavailable"
        : [d.authors || "Unknown author", d.year].filter(Boolean).join(" \u00b7 ");
    $("pvId").textContent = d.identifier || "Zotero item \u00b7 " + d.key;
    $("pvFormat").textContent = model.formatLabel;
    $("addToZotero").hidden = !d.unresolved;
    $("open").hidden = !d.url;
    $("open").textContent = d.unresolved ? "Open link" : d.needsReview ? "Open in Zotero to add details" : "Open in Zotero";
    $("copyDoi").hidden = !d.doi;
    $("pvDetails").hidden = d.needsReview;
    $("pvCode").textContent = d.code || "";
  }

  function renderSearchAffordances() {
    const value = $("search").value;
    $("clearSearch").classList.toggle("hidden", value === "");
    $("kbd").classList.toggle("hidden", value !== "");
    $("kbd").textContent = IS_MAC ? "\u2318F" : "Ctrl+F";
  }

  function closeBibMenu() {
    $("bibMenu").classList.add("hidden");
    $("bibMenuButton").setAttribute("aria-expanded", "false");
  }

  function render() {
    if (!model) {
      return;
    }
    $("loggedOut").classList.toggle("hidden", model.loggedIn);
    $("main").classList.toggle("hidden", !model.loggedIn);
    if (!model.loggedIn) {
      return;
    }

    $("dot").classList.toggle("busy", model.loading || model.offline);
    $("refresh").classList.toggle("spin", model.loading);
    $("refresh").disabled = model.loading;
    $("account").textContent = model.username || "connected";
    $("synced").textContent = syncLabel();

    if (document.activeElement !== $("search")) {
      $("search").value = model.filters.search;
    }
    renderSearchAffordances();
    $("sort").value = model.filters.sort;

    $("libCount").textContent = model.libraryCount;
    $("citedCount").textContent = model.citedCount;
    $("tabLibrary").setAttribute("aria-selected", String(model.filters.tab === "library"));
    $("tabCited").setAttribute("aria-selected", String(model.filters.tab === "cited"));

    const filterNote = model.filterCount ? " \u00b7 " + model.filterCount + (model.filterCount === 1 ? " filter" : " filters") : "";
    const loadNote = model.loadProgress
      ? " \u00b7 loading " + model.loadProgress.loaded + " of " + model.loadProgress.total
      : "";
    const searchNote = model.searching ? " \u00b7 searching Zotero..." : model.searchNote ? " \u00b7 " + model.searchNote : "";
    $("refCount").textContent = model.total + (model.total === 1 ? " reference" : " references") + filterNote + loadNote + searchNote;

    $("options").hidden = !model.showOptions;
    $("settings").setAttribute("aria-pressed", String(model.showOptions));
    $("filterDot").classList.toggle("hidden", !model.filterCount);
    fillSelect(
      $("collection"),
      [{ value: "", label: "All collections" }].concat(
        model.collections.map(function (c) { return { value: c.key, label: c.label }; })
      ),
      model.filters.collection
    );
    fillSelect(
      $("tag"),
      [{ value: "", label: "All tags" }].concat(
        model.tags.map(function (t) { return { value: t, label: t }; })
      ),
      model.filters.tag
    );

    renderList();
    renderPager();
    renderDetails();

    $("target").disabled = !model.hasEditor;
    $("targetText").textContent = model.hasEditor
      ? model.fileName + " \u00b7 cursor \u00b7 " + model.formatLabel
      : "No file open";
    const feedback = $("feedback");
    const hasMessage = !!model.feedback.text;
    feedback.textContent = hasMessage ? model.feedback.text : DEFAULT_FEEDBACK;
    feedback.className = "feedback" + (hasMessage ? (model.feedback.warn ? " warn" : " ok") : "");

    $("bibScope").textContent = model.hasEditor ? model.citedCount + " cited in file" : "";
    $("bibMenu").querySelectorAll("button").forEach(function (b) {
      b.disabled = b.dataset.scope === "file" && !model.hasEditor;
    });
  }

  window.addEventListener("message", function (event) {
    if (event.data && event.data.type === "model") {
      model = event.data.model;
      render();
    }
  });

  let searchTimer;
  function setSearch(value) {
    clearTimeout(searchTimer);
    send("filters", { filters: { search: value } });
  }
  $("search").addEventListener("input", function (e) {
    renderSearchAffordances();
    clearTimeout(searchTimer);
    const value = e.target.value;
    searchTimer = setTimeout(function () { setSearch(value); }, 120);
  });
  $("search").addEventListener("keydown", function (e) {
    if (e.key === "Escape" && e.target.value !== "") {
      e.target.value = "";
      renderSearchAffordances();
      setSearch("");
      e.stopPropagation();
    }
  });
  $("clearSearch").addEventListener("click", function () {
    $("search").value = "";
    renderSearchAffordances();
    setSearch("");
    $("search").focus();
  });
  document.addEventListener("keydown", function (e) {
    if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === "f") {
      e.preventDefault();
      $("search").focus();
      $("search").select();
    } else if (e.key === "Escape") {
      closeBibMenu();
    }
  });

  $("sort").addEventListener("change", function (e) { send("filters", { filters: { sort: e.target.value } }); });
  $("collection").addEventListener("change", function (e) { send("filters", { filters: { collection: e.target.value } }); });
  $("tag").addEventListener("change", function (e) { send("filters", { filters: { tag: e.target.value } }); });
  $("clearFilters").addEventListener("click", function () { send("filters", { filters: { collection: "", tag: "" } }); });
  $("tabLibrary").addEventListener("click", function () { send("filters", { filters: { tab: "library" } }); });
  $("tabCited").addEventListener("click", function () { send("filters", { filters: { tab: "cited" } }); });
  $("prevPage").addEventListener("click", function () { send("page", { page: model.page - 1 }); });
  $("nextPage").addEventListener("click", function () { send("page", { page: model.page + 1 }); });
  $("settings").addEventListener("click", function () { send("toggleOptions"); });
  $("target").addEventListener("click", function () { send("editTemplate"); });
  $("logout").addEventListener("click", function () { send("logout"); });
  $("refresh").addEventListener("click", function () { send("refresh"); });
  $("login").addEventListener("click", function () { send("login"); });
  $("keysLink").addEventListener("click", function (e) { e.preventDefault(); send("openKeys"); });
  $("manual").addEventListener("click", function () { send("manual"); });
  $("closePreview").addEventListener("click", function () { send("closeDetails"); });
  $("open").addEventListener("click", function () { send("openWeb"); });
  $("addToZotero").addEventListener("click", function () { send("relink", { key: model.details.key }); });
  $("copyKey").addEventListener("click", function () { send("copyKey"); });
  $("copyDoi").addEventListener("click", function () { send("copyDoi"); });

  $("bibliography").addEventListener("click", function () { closeBibMenu(); send("bibliography"); });
  $("bibMenuButton").addEventListener("click", function (e) {
    e.stopPropagation();
    const open = $("bibMenu").classList.toggle("hidden") === false;
    $("bibMenuButton").setAttribute("aria-expanded", String(open));
  });
  $("bibMenu").addEventListener("click", function (e) {
    const item = e.target.closest("button");
    if (!item || item.disabled) {
      return;
    }
    closeBibMenu();
    send("bibliography", { scope: item.dataset.scope, output: item.dataset.output || undefined });
  });
  document.addEventListener("click", function (e) {
    if (!e.target.closest(".split")) {
      closeBibMenu();
    }
  });

  $("list").addEventListener("click", function (e) {
    const action = e.target.closest("[data-action]");
    if (action) {
      send(action.dataset.action, { key: action.dataset.key });
      return;
    }
    const paper = e.target.closest(".paper");
    if (!paper) {
      return;
    }
    send(paper.dataset.review === "true" ? "details" : "insert", { key: paper.dataset.key });
  });

  $("list").addEventListener("keydown", function (e) {
    const paper = e.target.closest(".paper");
    if (!paper) {
      return;
    }
    const row = paper.parentElement;
    const sibling = e.key === "ArrowDown" ? row.nextElementSibling
      : e.key === "ArrowUp" ? row.previousElementSibling : null;
    const next = sibling && sibling.querySelector(".paper");
    if (next) {
      e.preventDefault();
      next.focus();
    }
  });

  setInterval(function () {
    if (model && model.loggedIn && !model.loading) {
      $("synced").textContent = syncLabel();
    }
  }, 30000);

  send("ready");
})();
