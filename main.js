// ========================
// CARGA DE DATOS & HELPERS
// ========================
let shotData = [];

async function loadShotData({ onProgress } = {}) {
    try {
        const seasons = Array.from({ length: 19 }, (_, i) => 2007 + i);
        const files = seasons.map(s => `data/shots_${s}.csv`);

        // Fetch all files in parallel
        const responses = await Promise.allSettled(
            files.map(f =>
                fetch(f).then(r => {
                    if (!r.ok) throw new Error(`HTTP ${r.status}`);
                    return r.text();
                })
            )
        );

        let allData = [];
        for (let i = 0; i < files.length; i++) {
            const res = responses[i];
            if (res.status !== 'fulfilled') continue;
            const csvText = res.value;
            if (!csvText || csvText.trim().length === 0) continue;

            const data = d3.csvParse(csvText);
            allData = allData.concat(data);

            // Map all collected data to shotData
            shotData = allData.map(d => ({
                coordX: +d.coordX || +d.arenaAdjustedXCordAbs || 0,
                coordY: +d.coordY || +d.arenaAdjustedYCord || 0,
                isGoal: d.goal === "true" || d.goal === "TRUE" || d.goal === "1",
                shotType: d.shotType || "",
                season: String(d.season || "").trim(),
                isPlayoffGame: (() => {
                    const v = (d.isPlayoffGame || "").toString().trim().toLowerCase();
                    return v === "true" || v === "1" || v === "yes" || v === "y";
                })(),
                period: +d.period || 0,
                shooterLeftRight: d.shooterLeftRight || "",
                shooterName: d.shooterName || "",
                goalieName: d.goalieName || "",
                shooterTeamCode: d.shooterTeamCode || "",
                onIceSituation: d.onIceSituation || "",
                shooterPosition: d.shooterPosition || "",
                shotOutcome: d.shotOutcome || "",
                goalieTeamCode: d.goalieTeamCode || "",
                // Nuevas métricas para el segundo scrollyteller
                xGoal: +d.xGoal || 0,
                xFroze: +d.xFroze || 0,
                xRebound: +d.xRebound || 0,
                xPlayStopped: +d.xPlayStopped || 0,
                xShotWasOnGoal: +d.xShotWasOnGoal || 0
            }));

            if (onProgress) {
                onProgress(i + 1, files.length, shotData);
            }

            // Yield to keep UI responsive
            await new Promise(r => setTimeout(r, 0));
        }

        return allData.length > 0;
    } catch (err) {
        console.error("Error en loadShotData:", err);
        return false;
    }
}

const RINK_IMAGE = "hockeyRink.jpg";

function periodLabel(p) {
    if (p === 4) return "OT";
    if (p === 5) return "SO";
    return String(p);
}

function getHeroFilters() {
    const goalRadio = document.querySelector('input[name="goal-result"]:checked')?.value || "all";
    const shotType = document.getElementById("hero-shottype")?.value || "all";
    const season = document.getElementById("hero-season")?.value || "all";
    const playoffRadio = document.querySelector('input[name="playoff"]:checked')?.value || "all";
    const period = document.getElementById("hero-period")?.value || "all";
    const handRadio = document.querySelector('input[name="hand"]:checked')?.value || "all";
    const onIceSituation = document.getElementById("hero-onicesituation")?.value || "all";
    const shooterPosition = document.getElementById("hero-shooterposition")?.value || "all";
    const shotOutcome = document.getElementById("hero-shotoutcome")?.value || "all";
    const shooter = document.getElementById("hero-shooter")?.value.trim().toLowerCase() || "";
    const goalie = document.getElementById("hero-goalie")?.value.trim().toLowerCase() || "";
    const team = document.getElementById("hero-team")?.value.trim().toLowerCase() || "";
    const goalieTeam = document.getElementById("hero-goalieteam")?.value.trim().toLowerCase() || "";

    return {
        goalFilter: goalRadio,
        shotType,
        season,
        playoff: playoffRadio,
        period,
        hand: handRadio,
        onIceSituation,
        shooterPosition,
        shotOutcome,
        shooter,
        goalie,
        team,
        goalieTeam
    };
}

function applyHeroFilters(data, filters) {
    let filtered = [...data];
    if (filters.goalFilter === "goals") filtered = filtered.filter(d => d.isGoal);
    else if (filters.goalFilter === "non-goals") filtered = filtered.filter(d => !d.isGoal);
    if (filters.shotType !== "all") filtered = filtered.filter(d => d.shotType === filters.shotType);
    if (filters.season !== "all") filtered = filtered.filter(d => d.season === filters.season);
    if (filters.playoff !== "all") {
        const playoffBool = filters.playoff === "true";
        filtered = filtered.filter(d => d.isPlayoffGame === playoffBool);
    }
    if (filters.period !== "all") filtered = filtered.filter(d => periodLabel(d.period) === filters.period);
    if (filters.hand !== "all") filtered = filtered.filter(d => d.shooterLeftRight === filters.hand);
    if (filters.onIceSituation !== "all") filtered = filtered.filter(d => d.onIceSituation === filters.onIceSituation);
    if (filters.shooterPosition !== "all") filtered = filtered.filter(d => d.shooterPosition === filters.shooterPosition);
    if (filters.shotOutcome !== "all") filtered = filtered.filter(d => d.shotOutcome === filters.shotOutcome);
    if (filters.shooter) filtered = filtered.filter(d => d.shooterName.toLowerCase().includes(filters.shooter));
    if (filters.goalie) filtered = filtered.filter(d => d.goalieName.toLowerCase().includes(filters.goalie));
    if (filters.team) filtered = filtered.filter(d => d.shooterTeamCode.toLowerCase().includes(filters.team));
    if (filters.goalieTeam) filtered = filtered.filter(d => d.goalieTeamCode.toLowerCase().includes(filters.goalieTeam));
    return filtered;
}

const RINK_X_MIN = 0;
const RINK_X_MAX = 100;
const RINK_Y_MIN = -42.5;
const RINK_Y_MAX = 42.5;

function renderHeroChart() {
    if (!shotData.length) return;
    const filters = getHeroFilters();
    let filtered = applyHeroFilters(shotData, filters);

    const container = d3.select("#hero-chart");
    container.html("");
    const legendEl = document.getElementById("hero-legend");

    if (filtered.length === 0) {
        container.append("p")
            .style("text-align", "center")
            .style("color", "#475569")
            .text("Ningún tiro coincide con los filtros seleccionados.");
        if (legendEl) legendEl.innerHTML = "";
        return;
    }

    const width = 800;
    const height = 680;
    const mapX = (x) => ((x - RINK_X_MIN) / (RINK_X_MAX - RINK_X_MIN)) * width;
    const mapY = (y) => height * (RINK_Y_MAX - y) / (RINK_Y_MAX - RINK_Y_MIN);

    const svg = container.append("svg")
        .attr("viewBox", `0 0 ${width} ${height}`)
        .attr("preserveAspectRatio", "xMidYMid meet");

    svg.append("image")
        .attr("href", RINK_IMAGE)
        .attr("width", width)
        .attr("height", height)
        .attr("preserveAspectRatio", "none")
        .style("opacity", 0.85);

    const geoPath = d3.geoPath();
    const showGoals = filters.goalFilter !== "non-goals";
    const showNonGoals = filters.goalFilter !== "goals";

    // Goles → azul
    if (showGoals) {
        const goalsData = filtered.filter(d => d.isGoal);
        if (goalsData.length) {
            const points = goalsData.map(d => [mapX(d.coordX), mapY(d.coordY)]);
            const density = d3.contourDensity()
                .x(d => d[0]).y(d => d[1])
                .size([width, height])
                .bandwidth(16).thresholds(6);
            const contours = density(points);
            const colorScale = d3.scaleSequentialLog()
                .domain([0, d3.max(contours, c => c.value)])
                .interpolator(d3.interpolateBlues);
            svg.append("g")
                .selectAll("path")
                .data(contours)
                .enter()
                .append("path")
                .attr("d", d => geoPath(d))
                .attr("fill", d => colorScale(d.value))
                .attr("fill-opacity", 0.8)
                .attr("stroke", "#0a3d6b")
                .attr("stroke-width", 0.8);
        }
    }

    // Fallados/Atajados → rojo
    if (showNonGoals) {
        const nonData = filtered.filter(d => !d.isGoal);
        if (nonData.length) {
            const points = nonData.map(d => [mapX(d.coordX), mapY(d.coordY)]);
            const density = d3.contourDensity()
                .x(d => d[0]).y(d => d[1])
                .size([width, height])
                .bandwidth(16).thresholds(6);
            const contours = density(points);
            const colorScale = d3.scaleSequentialLog()
                .domain([0, d3.max(contours, c => c.value)])
                .interpolator(d3.interpolateReds);
            svg.append("g")
                .selectAll("path")
                .data(contours)
                .enter()
                .append("path")
                .attr("d", d => geoPath(d))
                .attr("fill", d => colorScale(d.value))
                .attr("fill-opacity", 0.65)
                .attr("stroke", "#7a0c0c")
                .attr("stroke-width", 0.8);
        }
    }

    // Leyenda HTML
    if (legendEl) {
        legendEl.innerHTML = `
            <div class="legend-item">
                <span class="legend-color" style="background:#1d4ed8; border:1px solid #0a3d6b;"></span>
                <span>Goles</span>
            </div>
            <div class="legend-item">
                <span class="legend-color" style="background:#b91c1c; border:1px solid #7a0c0c;"></span>
                <span>Fallados/Atajados</span>
            </div>
            <div class="shots-count">Tiros: ${filtered.length}</div>
        `;
    }
}

function populateFilters() {
    if (!shotData.length) return;
    const shotTypes = [...new Set(shotData.map(d => d.shotType).filter(Boolean))].sort();
    const seasons = [...new Set(shotData.map(d => d.season).filter(Boolean))].sort((a, b) => a - b);
    const periods = [...new Set(shotData.map(d => periodLabel(d.period)).filter(Boolean))].sort((a,b) => {
        const order = {"1":1,"2":2,"3":3,"OT":4,"SO":5};
        return (order[a]||99) - (order[b]||99);
    });
    const onIceSituations = [...new Set(shotData.map(d => d.onIceSituation).filter(Boolean))].sort();
    const shooterPositions = [...new Set(shotData.map(d => d.shooterPosition).filter(Boolean))].sort();
    const shotOutcomes = [...new Set(shotData.map(d => d.shotOutcome).filter(Boolean))].sort();

    const shooterNames = [...new Set(shotData.map(d => d.shooterName).filter(Boolean))].sort();
    const goalieNames = [...new Set(shotData.map(d => d.goalieName).filter(Boolean))].sort();
    const shooterTeamCodes = [...new Set(shotData.map(d => d.shooterTeamCode).filter(Boolean))].sort();
    const goalieTeamCodes = [...new Set(shotData.map(d => d.goalieTeamCode).filter(Boolean))].sort();

    const populateSelect = (id, values) => {
        const select = document.getElementById(id);
        if (!select) return;
        select.innerHTML = select.options[0] ? `<option value="all">${select.options[0].text}</option>` : '<option value="all">Todos</option>';
        values.forEach(v => {
            const opt = document.createElement("option");
            opt.value = v;
            opt.textContent = v;
            select.appendChild(opt);
        });
    };
    populateSelect("hero-shottype", shotTypes);
    populateSelect("hero-season", seasons);
    populateSelect("hero-period", periods);
    populateSelect("hero-onicesituation", onIceSituations);
    populateSelect("hero-shooterposition", shooterPositions);
    populateSelect("hero-shotoutcome", shotOutcomes);

    const populateDatalist = (listId, values) => {
        const dl = document.getElementById(listId);
        if (!dl) return;
        dl.innerHTML = "";
        values.forEach(v => {
            const opt = document.createElement("option");
            opt.value = v;
            dl.appendChild(opt);
        });
    };
    populateDatalist("shooter-list", shooterNames);
    populateDatalist("goalie-list", goalieNames);
    populateDatalist("team-list", shooterTeamCodes);
    populateDatalist("goalieteam-list", goalieTeamCodes);
}

function setupHeroListeners() {
    const updateDebounced = debounce(() => renderHeroChart(), 200);
    document.getElementById("hero-shottype").addEventListener("change", renderHeroChart);
    document.getElementById("hero-season").addEventListener("change", renderHeroChart);
    document.getElementById("hero-period").addEventListener("change", renderHeroChart);
    document.getElementById("hero-onicesituation").addEventListener("change", renderHeroChart);
    document.getElementById("hero-shooterposition").addEventListener("change", renderHeroChart);
    document.getElementById("hero-shotoutcome").addEventListener("change", renderHeroChart);
    document.querySelectorAll('input[name="goal-result"]').forEach(r => r.addEventListener("change", renderHeroChart));
    document.querySelectorAll('input[name="playoff"]').forEach(r => r.addEventListener("change", renderHeroChart));
    document.querySelectorAll('input[name="hand"]').forEach(r => r.addEventListener("change", renderHeroChart));
    document.getElementById("hero-shooter").addEventListener("input", updateDebounced);
    document.getElementById("hero-goalie").addEventListener("input", updateDebounced);
    document.getElementById("hero-team").addEventListener("input", updateDebounced);
    document.getElementById("hero-goalieteam").addEventListener("input", updateDebounced);
    document.getElementById("hero-shooter").addEventListener("change", renderHeroChart);
    document.getElementById("hero-goalie").addEventListener("change", renderHeroChart);
    document.getElementById("hero-team").addEventListener("change", renderHeroChart);
    document.getElementById("hero-goalieteam").addEventListener("change", renderHeroChart);
}

function debounce(func, wait) {
    let timeout;
    return function(...args) {
        clearTimeout(timeout);
        timeout = setTimeout(() => func.apply(this, args), wait);
    };
}

// ========================
// PRIMER SCROLLYTELLER (temporadas)
// ========================
function renderContourPlot(containerId, filterType, options = {}) {
    if (!shotData.length) return;
    const { width = 600, height = 510, season = null } = options;
    let filtered = [...shotData];
    if (season) filtered = filtered.filter(d => d.season === season);
    if (filterType === "goals") filtered = filtered.filter(d => d.isGoal === true);
    if (filterType === "non-goals") filtered = filtered.filter(d => d.isGoal === false);

    const container = d3.select(`#${containerId}`);
    container.html("");

    const mapX = (x) => ((x - RINK_X_MIN) / (RINK_X_MAX - RINK_X_MIN)) * width;
    const mapY = (y) => height * (RINK_Y_MAX - y) / (RINK_Y_MAX - RINK_Y_MIN);

    const svg = container.append("svg")
        .attr("viewBox", `0 0 ${width} ${height}`)
        .attr("preserveAspectRatio", "xMidYMid meet")
        .attr("width", width)
        .attr("height", height);

    svg.append("image")
        .attr("href", RINK_IMAGE)
        .attr("width", width)
        .attr("height", height)
        .attr("preserveAspectRatio", "none")
        .style("opacity", 0.85);

    const geoPath = d3.geoPath();

    // Goles → azul
    if (filterType === "all" || filterType === "goals") {
        const goalsData = filtered.filter(d => d.isGoal === true);
        if (goalsData.length) {
            const points = goalsData.map(d => [mapX(d.coordX), mapY(d.coordY)]);
            const density = d3.contourDensity()
                .x(d => d[0]).y(d => d[1])
                .size([width, height])
                .bandwidth(16).thresholds(6);
            const contours = density(points);
            const colorScale = d3.scaleSequentialLog()
                .domain([0, d3.max(contours, c => c.value)])
                .interpolator(d3.interpolateBlues);
            svg.append("g")
                .selectAll("path")
                .data(contours)
                .enter()
                .append("path")
                .attr("d", d => geoPath(d))
                .attr("fill", d => colorScale(d.value))
                .attr("fill-opacity", 0.8)
                .attr("stroke", "#0a3d6b")
                .attr("stroke-width", 0.8);
        }
    }

    // Fallados/Atajados → rojo
    if (filterType === "all" || filterType === "non-goals") {
        const nonData = filtered.filter(d => d.isGoal === false);
        if (nonData.length) {
            const points = nonData.map(d => [mapX(d.coordX), mapY(d.coordY)]);
            const density = d3.contourDensity()
                .x(d => d[0]).y(d => d[1])
                .size([width, height])
                .bandwidth(16).thresholds(6);
            const contours = density(points);
            const colorScale = d3.scaleSequentialLog()
                .domain([0, d3.max(contours, c => c.value)])
                .interpolator(d3.interpolateReds);
            svg.append("g")
                .selectAll("path")
                .data(contours)
                .enter()
                .append("path")
                .attr("d", d => geoPath(d))
                .attr("fill", d => colorScale(d.value))
                .attr("fill-opacity", 0.65)
                .attr("stroke", "#7a0c0c")
                .attr("stroke-width", 0.8);
        }
    }

    // Contador de tiros (SVG)
    svg.append("text")
        .attr("x", width - 85)
        .attr("y", 25)
        .attr("fill", "#111")
        .attr("font-size", "11px")
        .attr("font-weight", "bold")
        .text(`Tiros: ${filtered.length}`);
}

async function setupScrollama() {
    const seasons = [...new Set(shotData.map(d => d.season).filter(Boolean))]
        .sort((a, b) => a - b);

    if (seasons.length === 0) {
        console.warn("No hay temporadas en los datos");
        return;
    }

    const steps = seasons.map(season => ({
        title: `Temporada ${season}`,
        text: `Distribución de tiros para la Temporada ${season}. Se muestra la densidad de disparos realizados durante esa campaña.`,
        season: season
    }));

    document.querySelector(".scrollyteller__narration").innerHTML = steps.map(step => `
        <div class="narration-step" data-step-season="${step.season}">
            <h2>${step.title}</h2>
            <p>${step.text}</p>
        </div>
    `).join('');

    document.getElementById("st-graph").innerHTML = `
        <div class="graph-title">Densidad de Tiros – <span id="filter-label">${steps[0].title}</span></div>
        <div id="scrolly-graph"></div>
    `;

    renderContourPlot("scrolly-graph", "all", { season: steps[0].season });

    const scroller = scrollama();
    scroller
        .setup({ step: ".narration-step", offset: 0.5, debug: false })
        .onStepEnter(response => {
            const season = response.element.getAttribute("data-step-season");
            const labelSpan = document.getElementById("filter-label");
            if (labelSpan && season) labelSpan.innerText = `Temporada ${season}`;
            renderContourPlot("scrolly-graph", "all", { season });
        });

    window.addEventListener("resize", scroller.resize);
}

// ========================
// SEGUNDO SCROLLYTELLER (métricas)
// ========================
function renderHeatmap(containerId, metric) {
    if (!shotData.length) return;
    const width = 600, height = 510;

    const binSize = 10; // píxeles
    const cols = Math.ceil(width / binSize);
    const rows = Math.ceil(height / binSize);
    const bins = new Array(cols * rows).fill(null).map(() => ({ sum: 0, count: 0 }));

    const mapX = (x) => ((x - RINK_X_MIN) / (RINK_X_MAX - RINK_X_MIN)) * width;
    const mapY = (y) => height * (RINK_Y_MAX - y) / (RINK_Y_MAX - RINK_Y_MIN);

    for (let i = 0; i < shotData.length; i++) {
        const d = shotData[i];
        const x = mapX(d.coordX);
        const y = mapY(d.coordY);
        if (x < 0 || x >= width || y < 0 || y >= height) continue;
        const col = Math.floor(x / binSize);
        const row = Math.floor(y / binSize);
        const idx = row * cols + col;
        bins[idx].sum += d[metric] || 0;
        bins[idx].count++;
    }

    const maxAvg = Math.max(...bins.map(b => b.count ? b.sum / b.count : 0), 0.001);

    const container = d3.select(`#${containerId}`);
    container.html("");

    const svg = container.append("svg")
        .attr("viewBox", `0 0 ${width} ${height}`)
        .attr("preserveAspectRatio", "xMidYMid meet")
        .attr("width", width)
        .attr("height", height);

    svg.append("image")
        .attr("href", RINK_IMAGE)
        .attr("width", width)
        .attr("height", height)
        .attr("preserveAspectRatio", "none")
        .style("opacity", 0.85);

    const colorScale = d3.scaleSequential(d3.interpolateYlOrRd)
        .domain([0, maxAvg]);

    for (let row = 0; row < rows; row++) {
        for (let col = 0; col < cols; col++) {
            const idx = row * cols + col;
            const bin = bins[idx];
            if (bin.count === 0) continue;
            const avg = bin.sum / bin.count;
            svg.append("rect")
                .attr("x", col * binSize)
                .attr("y", row * binSize)
                .attr("width", binSize)
                .attr("height", binSize)
                .attr("fill", colorScale(avg))
                .attr("stroke", "none")
                .attr("opacity", 0.7);
        }
    }

    svg.append("text")
        .attr("x", width - 85)
        .attr("y", 25)
        .attr("fill", "#111")
        .attr("font-size", "11px")
        .attr("font-weight", "bold")
        .text(`Métrica: ${metric}`);
}

async function setupScrollama2() {
    const metrics = [
        { id: "xGoal", title: "Expected Goals (xGoal)", text: "Probabilidad de que el tiro se convierta en gol." },
        { id: "xFroze", title: "Congelamiento (xFroze)", text: "Probabilidad de que el portero congele el disco." },
        { id: "xRebound", title: "Rebote (xRebound)", text: "Probabilidad de generar un rebote tras el tiro." },
        { id: "xPlayStopped", title: "Parada del Juego (xPlayStopped)", text: "Probabilidad de que el juego se detenga." },
        { id: "xShotWasOnGoal", title: "Tiro a Puerta (xShotWasOnGoal)", text: "Probabilidad de que el tiro vaya dirigido a la portería." }
    ];

    const narrationContainer = document.getElementById("narration2");
    narrationContainer.innerHTML = metrics.map((m, i) => `
        <div class="narration-step2" data-metric="${m.id}">
            <h2>${m.title}</h2>
            <p>${m.text}</p>
        </div>
    `).join('');

    const graphContainer = document.getElementById("st-graph2");
    graphContainer.innerHTML = `
        <div class="graph-title">Mapa de Calor – <span id="filter-label2">${metrics[0].title}</span></div>
        <div id="scrolly-graph2"></div>
    `;

    renderHeatmap("scrolly-graph2", metrics[0].id);

    const scroller2 = scrollama();
    scroller2
        .setup({
            step: ".narration-step2",
            offset: 0.5,
            debug: false
        })
        .onStepEnter(response => {
            const metric = response.element.getAttribute("data-metric");
            const labelSpan = document.getElementById("filter-label2");
            if (labelSpan) {
                const meta = metrics.find(m => m.id === metric);
                labelSpan.innerText = meta ? meta.title : metric;
            }
            renderHeatmap("scrolly-graph2", metric);
        });

    window.addEventListener("resize", scroller2.resize);
}

// ========================
// INICIALIZACIÓN
// ========================
async function init() {
    const overlay = document.getElementById("loading-overlay");
    if (overlay) overlay.classList.add("show");

    const loaded = await loadShotData({
        onProgress: (loadedCount, total) => {
            const pct = Math.round((loadedCount / total) * 100);
            const textEl = overlay?.querySelector(".loading-text");
            if (textEl) textEl.textContent = `Cargando datos… ${pct}%`;
            renderHeroChart();
        }
    });

    if (overlay) overlay.classList.remove("show");

    if (loaded) {
        populateFilters();
        setupHeroListeners();
        renderHeroChart();
        await new Promise(r => setTimeout(r, 100));
        setupScrollama();
        await new Promise(r => setTimeout(r, 200));
        setupScrollama2();
    }
}

init();