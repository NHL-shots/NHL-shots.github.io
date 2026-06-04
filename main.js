// ========================
// CARGA DE DATOS & HELPERS
// ========================
let shotData = [];

async function loadShotData({ onProgress } = {}) {
    try {
        const seasons = Array.from({ length: 19 }, (_, i) => 2007 + i);
        const files = seasons.map(s => `data/shots_${s}.csv`);

        const responses = await Promise.allSettled(
            files.map(f => fetch(f).then(r => {
                if (!r.ok) throw new Error(`HTTP ${r.status}`);
                return r.text();
            }))
        );

        let allData = [];
        for (let i = 0; i < files.length; i++) {
            const res = responses[i];
            if (res.status !== 'fulfilled') continue;
            const csvText = res.value;
            if (!csvText || csvText.trim().length === 0) continue;

            const data = d3.csvParse(csvText);
            allData = allData.concat(data);

            shotData = allData.map(d => ({
                // Coordenadas
                coordX: +d.coordX || +d.arenaAdjustedXCordAbs || 0,
                coordY: +d.coordY || +d.arenaAdjustedYCord || 0,

                // Resultado y tipo
                isGoal: d.goal === "true" || d.goal === "TRUE" || d.goal === "1",
                goal: d.goal,                               // por si acaso
                shotType: d.shotType || "",

                // Temporada / partido
                season: String(d.season || "").trim(),
                isPlayoffGame: (() => {
                    const v = (d.isPlayoffGame || "").toString().trim().toLowerCase();
                    return v === "true" || v === "1" || v === "yes" || v === "y";
                })(),

                // Tiempo / periodo
                period: +d.period || 0,
                time: d.time || "",
                timeUntilNextEvent: d.timeUntilNextEvent || "",
                timeSinceLastEvent: d.timeSinceLastEvent || "",
                timeSinceFaceoff: d.timeSinceFaceoff || "",
                shooterTimeOnIce: d.shooterTimeOnIce || "",
                shooterTimeOnIceSinceFaceoff: d.shooterTimeOnIceSinceFaceoff || "",

                // Evento previo (esencial para el tercer scrollyteller)
                lastEventCategory: d.lastEventCategory || "",
                lastEventTeam: d.lastEventTeam || "",
                lastEventXCord: +d.lastEventXCord || 0,
                lastEventYCord: +d.lastEventYCord || 0,
                lastEventDistance: +d.lastEventDistance || 0,
                lastEventAngle: +d.lastEventAngle || 0,

                // Jugador / portero
                shooterName: d.shooterName || "",
                goalieName: d.goalieName || "",
                shooterLeftRight: d.shooterLeftRight || "",
                shooterPosition: d.shooterPosition || "",
                shooterTeamCode: d.shooterTeam || "",
                goalieTeamCode: d.goalieTeam || "",

                // Situación y detalles del tiro
                onIceSituation: d.onIceSituation || "",
                shotOutcome: d.shotOutcome || "",
                shotOnEmptyNet: d.shotOnEmptyNet || "",
                shotRebound: d.shotRebound || "",
                shotRush: d.shotRush || "",
                shotWasOnGoal: d.shotWasOnGoal || "",
                shotGoalieFroze: d.shotGoalieFroze || "",
                shotPlayStopped: d.shotPlayStopped || "",
                shotGeneratedRebound: d.shotGeneratedRebound || "",
                offWing: d.offWing || "",
                shotDistance: +d.shotDistance || 0,

                // Métricas avanzadas
                xGoal: +d.xGoal || 0,
                xFroze: +d.xFroze || 0,
                xRebound: +d.xRebound || 0,
                xPlayStopped: +d.xPlayStopped || 0,
                xShotWasOnGoal: +d.xShotWasOnGoal || 0,

                // Marcador y equipos
                homeTeamGoals: +d.homeTeamGoals || 0,
                awayTeamGoals: +d.awayTeamGoals || 0,
                shooterIsHomeTeam: d.shooterIsHomeTeam || "",
                shootingTeamWon: d.shootingTeamWon || "",

                // Velocidad y diferencia de tiempo
                speedFromLastEvent: d.speedFromLastEvent || "",
                timeDifferenceSinceChange: d.timeDifferenceSinceChange || "",
                averageRestDifference: d.averageRestDifference || "",

                // Rankings y estadísticas de temporada
                ShooterSeasonRank: d.ShooterSeasonRank || "",
                shooterSeasonGoals: d.shooterSeasonGoals || "",
                shooterShootingPct: d.shooterShootingPct || "",
                goalieSeasonRank: d.goalieSeasonRank || "",
                goalieSeasonWins: d.goalieSeasonWins || "",
                goalieSavePct: d.goalieSavePct || "",
                shooterTeamSeasonRank: d.shooterTeamSeasonRank || "",
                goalieTeamSeasonRank: d.goalieTeamSeasonRank || ""
            }));

            if (onProgress) {
                onProgress(i + 1, files.length, shotData);
            }
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
const BANDWIDTH = 10;
const THRESHOLD = 8;

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

    const width = 800, height = 680;
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

    // ── Goles → azul ──
    if (showGoals) {
        const goalsData = filtered.filter(d => d.isGoal);
        if (goalsData.length) {
            const points = goalsData.map(d => [mapX(d.coordX), mapY(d.coordY)]);
            const density = d3.contourDensity()
                .x(d => d[0]).y(d => d[1])
                .size([width, height])
                .bandwidth(BANDWIDTH).thresholds(THRESHOLD);
            const contours = density(points);

            const posContours = contours.filter(c => c.value > 0);
            const goalMin = posContours.length ? d3.min(posContours, c => c.value) : 0.001;
            const goalMax = d3.max(contours, c => c.value) || 0.01;
            const goalColorScale = d3.scaleSequentialLog()
                .domain([goalMin, goalMax])
                .interpolator(d3.interpolateRgbBasis(["#bad9f5", "#08306b"]));

            svg.append("g")
                .selectAll("path")
                .data(contours)
                .enter()
                .append("path")
                .attr("d", geoPath)
                .attr("fill", d => goalColorScale(d.value))
                .attr("fill-opacity", 0.85)
                .attr("stroke", "#1d4ed8")
                .attr("stroke-width", 0.8);
        }
    }

    // ── Fallados / Atajados → rojo ──
    if (showNonGoals) {
        const nonData = filtered.filter(d => !d.isGoal);
        if (nonData.length) {
            const points = nonData.map(d => [mapX(d.coordX), mapY(d.coordY)]);
            const density = d3.contourDensity()
                .x(d => d[0]).y(d => d[1])
                .size([width, height])
                .bandwidth(BANDWIDTH).thresholds(THRESHOLD);
            const contours = density(points);

            const posContours = contours.filter(c => c.value > 0);
            const nonMin = posContours.length ? d3.min(posContours, c => c.value) : 0.001;
            const nonMax = d3.max(contours, c => c.value) || 0.01;
            const nonColorScale = d3.scaleSequentialLog()
                .domain([nonMin, nonMax])
                .interpolator(d3.interpolateRgbBasis(["#f8aca2", "#670c00"]));

            svg.append("g")
                .selectAll("path")
                .data(contours)
                .enter()
                .append("path")
                .attr("d", geoPath)
                .attr("fill", d => nonColorScale(d.value))
                .attr("fill-opacity", 0.35)
                .attr("stroke", "#cbd5e1")
                .attr("stroke-width", 0.4);
        }
    }

    // ── Leyenda HTML ──
    if (legendEl) {
        legendEl.innerHTML = `
            <div class="legend-title">Densidad de tiros</div>
            <div class="legend-gradient-group">
                <div class="legend-label">Goles</div>
                <div class="legend-gradient-bar" style="background: linear-gradient(to right, #deebf7, #08306b);"></div>
            </div>
            <div class="legend-gradient-group">
                <div class="legend-label">Fallados / Atajados</div>
                <div class="legend-gradient-bar" style="background: linear-gradient(to right, #fee0d2, #67001f);"></div>
            </div>
            <div class="shots-count">Tiros: ${filtered.length.toLocaleString('es-ES')}</div>
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
    const { width = 600, height = 510, seasonStart = null, seasonEnd = null, legendId = null } = options;
    let filtered = [...shotData];

    // Filter by season range
    if (seasonStart !== null && seasonEnd !== null) {
        filtered = filtered.filter(d => {
            const s = Number(d.season);
            return s >= seasonStart && s <= seasonEnd;
        });
    }

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

    // ── Goles (azul) ──
    let goalMin, goalMax;
    if (filterType === "all" || filterType === "goals") {
        const goalsData = filtered.filter(d => d.isGoal === true);
        if (goalsData.length) {
            const points = goalsData.map(d => [mapX(d.coordX), mapY(d.coordY)]);
            const density = d3.contourDensity()
                .x(d => d[0]).y(d => d[1])
                .size([width, height])
                .bandwidth(BANDWIDTH).thresholds(THRESHOLD);
            const contours = density(points);

            const posContours = contours.filter(c => c.value > 0);
            goalMin = posContours.length ? d3.min(posContours, c => c.value) : 0.001;
            goalMax = d3.max(contours, c => c.value) || 0.01;
            const goalColorScale = d3.scaleSequentialLog()
                .domain([goalMin, goalMax])
                .interpolator(d3.interpolateRgbBasis(["#bad9f5", "#08306b"]));

            svg.append("g")
                .selectAll("path")
                .data(contours)
                .enter()
                .append("path")
                .attr("d", geoPath)
                .attr("fill", d => goalColorScale(d.value))
                .attr("fill-opacity", 0.85)
                .attr("stroke", "#1d4ed8")
                .attr("stroke-width", 0.8);
        }
    }

    // ── Fallados/Atajados (rojo) ──
    let nonMin, nonMax;
    if (filterType === "all" || filterType === "non-goals") {
        const nonData = filtered.filter(d => d.isGoal === false);
        if (nonData.length) {
            const points = nonData.map(d => [mapX(d.coordX), mapY(d.coordY)]);
            const density = d3.contourDensity()
                .x(d => d[0]).y(d => d[1])
                .size([width, height])
                .bandwidth(BANDWIDTH).thresholds(THRESHOLD);
            const contours = density(points);

            const posContours = contours.filter(c => c.value > 0);
            nonMin = posContours.length ? d3.min(posContours, c => c.value) : 0.001;
            nonMax = d3.max(contours, c => c.value) || 0.01;
            const nonColorScale = d3.scaleSequentialLog()
                .domain([nonMin, nonMax])
                .interpolator(d3.interpolateRgbBasis(["#f8aca2", "#670c00"]));

            svg.append("g")
                .selectAll("path")
                .data(contours)
                .enter()
                .append("path")
                .attr("d", geoPath)
                .attr("fill", d => nonColorScale(d.value))
                .attr("fill-opacity", 0.35)
                .attr("stroke", "#cbd5e1")
                .attr("stroke-width", 0.4);
        }
    }

    // ── Legend (only when legendId is given) ──
    if (legendId) {
        const legendEl = document.getElementById(legendId);
        if (legendEl) {
            const gradientBar = (label, color1, color2, min, max) => {
                if (min === undefined) return "";
                const fMin = min < 0.01 ? min.toExponential(1) : min.toFixed(2);
                const fMax = max < 0.01 ? max.toExponential(1) : max.toFixed(2);
                return `
                    <div class="legend-label">${label}</div>
                    <div class="legend-gradient-bar" style="background: linear-gradient(to right, ${color1}, ${color2});"></div>`;
            };

            let goalBlock = "";
            if ((filterType === "all" || filterType === "goals") && goalMin !== undefined) {
                goalBlock = gradientBar("Goles", "#deebf7", "#08306b", goalMin, goalMax);
            }
            let nonBlock = "";
            if ((filterType === "all" || filterType === "non-goals") && nonMin !== undefined) {
                nonBlock = gradientBar("Fallados/Atajados", "#fee0d2", "#67001f", nonMin, nonMax);
            }

            legendEl.innerHTML = `
                <div class="legend-gradient-group">${goalBlock}</div>
                <div class="legend-gradient-group">${nonBlock}</div>
                <div class="shots-count">Tiros: ${filtered.length.toLocaleString('es-ES')}</div>
            `;
        }
    }
}

async function setupScrollama() {
    const allSeasons = [...new Set(shotData.map(d => d.season).filter(Boolean))]
        .map(Number)
        .sort((a, b) => a - b);

    if (allSeasons.length === 0) {
        console.warn("No hay temporadas en los datos");
        return;
    }

    const groups = [
        { label: "2007 – 2010", start: 2007, end: 2010 },
        { label: "2011 – 2014", start: 2011, end: 2014 },
        { label: "2015 – 2019", start: 2015, end: 2019 },
        { label: "2020 – 2025", start: 2020, end: 2025 }
    ];

    const steps = groups.map(group => ({
        title: `Temporadas ${group.label}`,
        text: `Distribución de tiros desde ${group.start} hasta ${group.end}. Densidad de disparos combinados en ese período.`,
        seasonStart: group.start,
        seasonEnd: group.end
    }));

    document.querySelector(".scrollyteller__narration").innerHTML = steps.map(step => `
        <div class="narration-step" data-season-start="${step.seasonStart}" data-season-end="${step.seasonEnd}">
            <h2>${step.title}</h2>
            <p>${step.text}</p>
        </div>
    `).join('');

    document.getElementById("st-graph").innerHTML = `
        <div class="graph-title">Densidad de Tiros – <span id="filter-label">${steps[0].title}</span></div>
        <div id="scrolly-legend1" class="chart-legend2"></div>
        <div id="scrolly-graph"></div>
    `;

    // render initial step with the first group range
    renderContourPlot("scrolly-graph", "all", {
        seasonStart: steps[0].seasonStart,
        seasonEnd: steps[0].seasonEnd,
        legendId: "scrolly-legend1"
    });

    const scroller = scrollama();
    scroller
        .setup({ step: ".narration-step", offset: 0.5, debug: false })
        .onStepEnter(response => {
            const start = +response.element.getAttribute("data-season-start");
            const end = +response.element.getAttribute("data-season-end");
            const labelSpan = document.getElementById("filter-label");
            if (labelSpan) labelSpan.innerText = `Temporadas ${start} – ${end}`;
            renderContourPlot("scrolly-graph", "all", {
                seasonStart: start,
                seasonEnd: end,
                legendId: "scrolly-legend1"
            });
        });

    window.addEventListener("resize", scroller.resize);
}

// ========================
// SEGUNDO SCROLLYTELLER (métricas)
// ========================
function renderHeatmap(containerId, metric) {
    if (!shotData.length) return;
    const width = 600, height = 510;

    const binSize = 30;
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
        .domain([0, 1]);

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

    // Leyenda del segundo scrollyteller
    const legend2 = document.getElementById("scrolly-legend2");
    if (legend2) {
        legend2.innerHTML = `
            <div class="legend-gradient-group">
                <div class="legend-label">${metric}</div>
                <div class="legend-gradient-bar" style="background: linear-gradient(to right, #ffffcc, #800026);"></div>
                <div class="legend-range">
                    <span>0</span>
                    <span>1</span>
                </div>
            </div>
        `;
    }
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
        <div id="scrolly-legend2" class="chart-legend2"></div>
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
// TERCER SCROLLYTELLER (métricas)
// ========================
function renderHeatmap(containerId, metric) {
    if (!shotData.length) return;
    const width = 600, height = 510;
    const binSize = 20;

    const cols = Math.ceil(width / binSize);
    const rows = Math.ceil(height / binSize);
    const bins = new Array(cols * rows).fill(null).map(() => ({ sum: 0, count: 0 }));

    const mapX = (x) => ((x - RINK_X_MIN) / (RINK_X_MAX - RINK_X_MIN)) * width;
    const mapY = (y) => height * (RINK_Y_MAX - y) / (RINK_Y_MAX - RINK_Y_MIN);

    for (let i = 0; i < shotData.length; i++) {
        const d = shotData[i];
        // Skip shots behind the net (x > 89 ft)
        if (d.coordX > 89) continue;

        const x = mapX(d.coordX);
        const y = mapY(d.coordY);
        if (x < 0 || x >= width || y < 0 || y >= height) continue;
        const col = Math.floor(x / binSize);
        const row = Math.floor(y / binSize);
        const idx = row * cols + col;
        bins[idx].sum += d[metric] || 0;
        bins[idx].count++;
    }

    const avgValues = bins.filter(b => b.count > 0).map(b => b.sum / b.count);
    if (avgValues.length === 0) {
        d3.select(`#${containerId}`).html("<p style='text-align:center;color:#555;'>Sin datos para esta métrica</p>");
        return;
    }

    let minAvg = d3.min(avgValues);
    let maxAvg = d3.max(avgValues);
    if (minAvg === maxAvg) { minAvg -= 0.001; maxAvg += 0.001; }

    const colorScale = d3.scaleSequential(d3.interpolateYlOrRd).domain([minAvg, maxAvg]);

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

    const legend2 = document.getElementById("scrolly-legend2");
    if (legend2) {
        legend2.innerHTML = `
            <div class="legend-gradient-group">
                <div class="legend-label">${metric}</div>
                <div class="legend-gradient-bar" style="background: linear-gradient(to right, ${colorScale(minAvg)}, ${colorScale(maxAvg)});"></div>
                <div class="legend-range">
                    <span>${minAvg.toFixed(4)}</span>
                    <span>${maxAvg.toFixed(4)}</span>
                </div>
            </div>
        `;
    }
}

function setupScrollama3() {
    const categoryLabels = {
        "SHOT": "Tiro",
        "MISSED_SHOT": "Tiro fallado",
        "BLOCKED_SHOT": "Tiro bloqueado",
        "GOAL": "Gol",
        "HIT": "Golpe / Carga",
        "GIVEAWAY": "Pérdida de disco",
        "TAKEAWAY": "Recuperación de disco",
        "FACEOFF": "Faceoff",
        "PENALTY": "Penalización",
        "DELPEN": "Penalización retrasada",
        "STOP": "Parada del juego",
        "PERIOD_END": "Fin del periodo",
        "GAME_END": "Fin del partido",
        "OFFSIDE": "Fuera de juego",
        "ICING": "Icing",
        "FACEOFF_WIN": "Faceoff ganado"
    };

    let sourceData = shotData.filter(d => d.isPlayoffGame === true);
    let dataSourceText = "playoffs";
    if (sourceData.length === 0) {
        sourceData = shotData;
        dataSourceText = "toda la temporada (no se encontraron tiros de playoffs)";
    }

    const categories = [...new Set(sourceData.map(d => d.lastEventCategory).filter(Boolean))];
    if (categories.length === 0) {
        document.getElementById("narration3").innerHTML = `
            <div class="narration-step3" style="height:auto; text-align:center;">
                <h2>Sin datos de evento previo</h2>
                <p>No se pudo encontrar la columna <em>lastEventCategory</em> en los registros de ${dataSourceText}.</p>
            </div>`;
        document.getElementById("st-graph3").innerHTML = `
            <div style="display:flex; align-items:center; justify-content:center; height:100%; color:#555;">
                <p>Gráfico no disponible.</p>
            </div>`;
        return;
    }

    const counts = {};
    categories.forEach(cat => {
        counts[cat] = sourceData.filter(d => d.lastEventCategory === cat).length;
    });
    const sortedCats = categories.sort((a, b) => counts[b] - counts[a]).slice(0, 8);

    document.getElementById("narration3").innerHTML = sortedCats.map(cat => {
        const count = counts[cat] || 0;
        const label = categoryLabels[cat] || cat;
        const safeCat = cat.replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        return `
        <div class="narration-step3" data-category="${safeCat}">
            <h2>${label} (${cat})</h2>
            <p>Disparos precedidos por <strong>${label.toLowerCase()}</strong> (datos de ${dataSourceText}): ${count.toLocaleString('es-ES')}.</p>
        </div>`;
    }).join('');

    document.getElementById("st-graph3").innerHTML = `
        <div class="graph-title">Flujo Pre‑Tiro – <span id="filter-label3">${categoryLabels[sortedCats[0]] || sortedCats[0]}</span></div>
        <div id="scrolly-legend3" class="chart-legend2"></div>
        <div id="scrolly-graph3"></div>
    `;

    renderFlowMap("scrolly-graph3", sortedCats[0], sourceData);

    const scroller3 = scrollama();
    scroller3
        .setup({
            step: "#narration3 .narration-step3",
            offset: 0.5,
            debug: false
        })
        .onStepEnter(response => {
            const category = response.element.getAttribute("data-category");
            const label = categoryLabels[category] || category;
            document.getElementById("filter-label3").innerText = label;
            renderFlowMap("scrolly-graph3", category, sourceData);
        });

    window.addEventListener("resize", scroller3.resize);
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
        await new Promise(r => setTimeout(r, 300));
        console.log("Iniciando setupScrollama3");
        setupScrollama3();
    }
}

init();