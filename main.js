// main.js
// ========================
// DATA LOADING & HELPERS
// ========================
let shotData = [];

async function loadShotData() {
    try {
        const response = await fetch("shots_2025.csv");
        const csvText = await response.text();
        const data = d3.csvParse(csvText);
        shotData = data.map(d => ({
            positionX: +d.arenaAdjustedXCordABS,
            positionY: +d.arenaAdjustedYCord,
            isGoal: d.goal === "true" || d.goal === "TRUE" || d.goal === "1",
            shotType: d.shotType || "",
            season: d.season || "",
            isPlayoffGame: d.isPlayoffGame === "true" || d.isPlayoffGame === "TRUE" || d.isPlayoffGame === "1",
            period: +d.period || 0,
            shooterLeftRight: d.shooterLeftRight || "",
            shooterName: d.shooterName || "",
            goalieName: d.goalieNameForShot || "",  // adjust column name if needed
            teamName: d.teamCode || ""
        }));
        console.log(`✅ Loaded ${shotData.length} shots`);
        return true;
    } catch (err) {
        console.error("Error loading CSV:", err);
        return false;
    }
}

const RINK_IMAGE = "hockeyRink.jpg";

function periodLabel(p) {
    if (p === 4) return "OT";
    if (p === 5) return "SO";
    return String(p);
}

// Read all filter values from the updated DOM
function getHeroFilters() {
    const goalRadio = document.querySelector('input[name="goal-result"]:checked')?.value || "all";
    const shotType = document.getElementById("hero-shottype")?.value || "all";
    const season = document.getElementById("hero-season")?.value || "all";
    const playoffRadio = document.querySelector('input[name="playoff"]:checked')?.value || "all";
    const period = document.getElementById("hero-period")?.value || "all";
    const handRadio = document.querySelector('input[name="hand"]:checked')?.value || "all";
    const shooter = document.getElementById("hero-shooter")?.value.trim().toLowerCase() || "";
    const goalie = document.getElementById("hero-goalie")?.value.trim().toLowerCase() || "";
    const team = document.getElementById("hero-team")?.value.trim().toLowerCase() || "";

    return {
        goalFilter: goalRadio,
        shotType,
        season,
        playoff: playoffRadio,
        period,
        hand: handRadio,
        shooter,
        goalie,
        team
    };
}

function applyHeroFilters(data, filters) {
    let filtered = [...data];

    // Goal filter
    if (filters.goalFilter === "goals") {
        filtered = filtered.filter(d => d.isGoal);
    } else if (filters.goalFilter === "non-goals") {
        filtered = filtered.filter(d => !d.isGoal);
    }

    // Shot type
    if (filters.shotType !== "all") {
        filtered = filtered.filter(d => d.shotType === filters.shotType);
    }

    // Season
    if (filters.season !== "all") {
        filtered = filtered.filter(d => d.season === filters.season);
    }

    // Playoff
    if (filters.playoff !== "all") {
        const playoffBool = filters.playoff === "true";
        filtered = filtered.filter(d => d.isPlayoffGame === playoffBool);
    }

    // Period
    if (filters.period !== "all") {
        filtered = filtered.filter(d => periodLabel(d.period) === filters.period);
    }

    // Shooter hand
    if (filters.hand !== "all") {
        filtered = filtered.filter(d => d.shooterLeftRight === filters.hand);
    }

    // Searchable fields (case‑insensitive)
    if (filters.shooter) {
        filtered = filtered.filter(d => d.shooterName.toLowerCase().includes(filters.shooter));
    }
    if (filters.goalie) {
        filtered = filtered.filter(d => d.goalieName.toLowerCase().includes(filters.goalie));
    }
    if (filters.team) {
        filtered = filtered.filter(d => d.teamName.toLowerCase().includes(filters.team));
    }

    return filtered;
}

// Use fixed rink dimensions (in feet)
const RINK_X_MIN = 0;        // center ice
const RINK_X_MAX = 100;      // end boards (image width)
const RINK_Y_MIN = -42.5;    // bottom boards
const RINK_Y_MAX = 42.5;     // top boards

// Updated render for the hero chart
function renderHeroChart() {
    if (!shotData.length) return;

    const filters = getHeroFilters();
    let filtered = applyHeroFilters(shotData, filters);

    const container = d3.select("#hero-chart");
    container.html("");

    if (filtered.length === 0) {
        container.append("p")
            .style("text-align", "center")
            .style("color", "#475569")
            .text("No shots match the selected filters.");
        return;
    }

    const width = 800;
    const height = 680;

    // Linear mapping from real feet to pixel coordinates
    const mapX = (x) => ((x - RINK_X_MIN) / (RINK_X_MAX - RINK_X_MIN)) * width;
    const mapY = (y) => height * (RINK_Y_MAX - y) / (RINK_Y_MAX - RINK_Y_MIN); // y positive up → top of image

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

    // Goals → blue
    if (showGoals) {
        const goalsData = filtered.filter(d => d.isGoal);
        if (goalsData.length) {
            const points = goalsData.map(d => [mapX(d.positionX), mapY(d.positionY)]);
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
                .attr("fill-opacity", 0.65)
                .attr("stroke", "#1d4ed8")
                .attr("stroke-width", 0.8);
        }
    }

    // Missed/Saved → red
    if (showNonGoals) {
        const nonData = filtered.filter(d => !d.isGoal);
        if (nonData.length) {
            const points = nonData.map(d => [mapX(d.positionX), mapY(d.positionY)]);
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
                .attr("fill-opacity", 0.5)
                .attr("stroke", "#b91c1c")
                .attr("stroke-width", 0.8);
        }
    }

    svg.append("text")
        .attr("x", width - 85)
        .attr("y", 25)
        .attr("fill", "#111")
        .attr("font-size", "11px")
        .attr("font-weight", "bold")
        .text(`🎯 ${filtered.length} shots`);
}

// Populate dropdowns & datalists
function populateFilters() {
    if (!shotData.length) return;

    const shotTypes = [...new Set(shotData.map(d => d.shotType).filter(Boolean))].sort();
    const seasons = [...new Set(shotData.map(d => d.season).filter(Boolean))].sort();
    const periods = [...new Set(shotData.map(d => periodLabel(d.period)).filter(Boolean))].sort((a,b) => {
        const order = {"1":1,"2":2,"3":3,"OT":4,"SO":5};
        return (order[a]||99) - (order[b]||99);
    });
    const shooterNames = [...new Set(shotData.map(d => d.shooterName).filter(Boolean))].sort();
    const goalieNames = [...new Set(shotData.map(d => d.goalieName).filter(Boolean))].sort();
    const teamNames = [...new Set(shotData.map(d => d.teamName).filter(Boolean))].sort();

    // Shot type dropdown
    const shotTypeSelect = document.getElementById("hero-shottype");
    if (shotTypeSelect) {
        shotTypeSelect.innerHTML = '<option value="all">All Types</option>';
        shotTypes.forEach(t => {
            const opt = document.createElement("option");
            opt.value = t;
            opt.textContent = t;
            shotTypeSelect.appendChild(opt);
        });
    }

    // Season dropdown
    const seasonSelect = document.getElementById("hero-season");
    if (seasonSelect) {
        seasonSelect.innerHTML = '<option value="all">All Seasons</option>';
        seasons.forEach(s => {
            const opt = document.createElement("option");
            opt.value = s;
            opt.textContent = s;
            seasonSelect.appendChild(opt);
        });
    }

    // Period dropdown
    const periodSelect = document.getElementById("hero-period");
    if (periodSelect) {
        periodSelect.innerHTML = '<option value="all">All Periods</option>';
        periods.forEach(p => {
            const opt = document.createElement("option");
            opt.value = p;
            opt.textContent = p;
            periodSelect.appendChild(opt);
        });
    }

    // Datalists for search inputs
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
    populateDatalist("team-list", teamNames);
}

// Attach listeners (debounce for text inputs)
function setupHeroListeners() {
    const updateDebounced = debounce(() => renderHeroChart(), 200);

    // Dropdowns
    document.getElementById("hero-shottype").addEventListener("change", renderHeroChart);
    document.getElementById("hero-season").addEventListener("change", renderHeroChart);
    document.getElementById("hero-period").addEventListener("change", renderHeroChart);

    // Radio buttons
    document.querySelectorAll('input[name="goal-result"]').forEach(r => r.addEventListener("change", renderHeroChart));
    document.querySelectorAll('input[name="playoff"]').forEach(r => r.addEventListener("change", renderHeroChart));
    document.querySelectorAll('input[name="hand"]').forEach(r => r.addEventListener("change", renderHeroChart));

    // Search inputs (debounced)
    document.getElementById("hero-shooter").addEventListener("input", updateDebounced);
    document.getElementById("hero-goalie").addEventListener("input", updateDebounced);
    document.getElementById("hero-team").addEventListener("input", updateDebounced);

    // Also update on clear (change event)
    document.getElementById("hero-shooter").addEventListener("change", renderHeroChart);
    document.getElementById("hero-goalie").addEventListener("change", renderHeroChart);
    document.getElementById("hero-team").addEventListener("change", renderHeroChart);
}

function debounce(func, wait) {
    let timeout;
    return function(...args) {
        clearTimeout(timeout);
        timeout = setTimeout(() => func.apply(this, args), wait);
    };
}

// ========================
// SCROLLYTELLING (unchanged)
// ========================
function renderContourPlot(containerId, filterType, options = {}) {
    if (!shotData.length) return;
    const { width = 600, height = 510 } = options;

    let filtered = [...shotData];
    if (filterType === "goals") filtered = shotData.filter(d => d.isGoal === true);
    if (filterType === "non-goals") filtered = shotData.filter(d => d.isGoal === false);

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

    // You can keep the original colors or swap them – I'll leave as is (yellow‑red / purple‑blue)
    if (filterType === "all" || filterType === "goals") {
        const goalsData = filtered.filter(d => d.isGoal === true);
        if (goalsData.length) {
            const points = goalsData.map(d => [mapX(d.positionX), mapY(d.positionY)]);
            const density = d3.contourDensity()
                .x(d => d[0]).y(d => d[1])
                .size([width, height])
                .bandwidth(16).thresholds(6);
            const contours = density(points);
            const colorScale = d3.scaleSequentialLog()
                .domain([0, d3.max(contours, c => c.value)])
                .interpolator(d3.interpolateYlOrRd);
            svg.append("g")
                .selectAll("path")
                .data(contours)
                .enter()
                .append("path")
                .attr("d", d => geoPath(d))
                .attr("fill", d => colorScale(d.value))
                .attr("fill-opacity", 0.65)
                .attr("stroke", "#e69500")
                .attr("stroke-width", 0.8);
        }
    }

    if (filterType === "all" || filterType === "non-goals") {
        const nonData = filtered.filter(d => d.isGoal === false);
        if (nonData.length) {
            const points = nonData.map(d => [mapX(d.positionX), mapY(d.positionY)]);
            const density = d3.contourDensity()
                .x(d => d[0]).y(d => d[1])
                .size([width, height])
                .bandwidth(16).thresholds(6);
            const contours = density(points);
            const colorScale = d3.scaleSequentialLog()
                .domain([0, d3.max(contours, c => c.value)])
                .interpolator(d3.interpolatePuBu);
            svg.append("g")
                .selectAll("path")
                .data(contours)
                .enter()
                .append("path")
                .attr("d", d => geoPath(d))
                .attr("fill", d => colorScale(d.value))
                .attr("fill-opacity", 0.5)
                .attr("stroke", "#4a90e2")
                .attr("stroke-width", 0.8);
        }
    }

    svg.append("text")
        .attr("x", width - 85)
        .attr("y", 25)
        .attr("fill", "#111")
        .attr("font-size", "11px")
        .attr("font-weight", "bold")
        .text(`🎯 ${filtered.length} shots`);
}

async function setupScrollama() {
    const steps = [
        { title: "🏒 Overview: All Shots", text: "Complete shot distribution. Yellow-red = goals, purple-blue = missed.", filter: "all" },
        { title: "🔥 Power Play Opportunities", text: "More shots from the slot area. Density increases between faceoff circles.", filter: "goals" },
        { title: "🧊 Even Strength Analysis", text: "Wider shot distribution. Defensemen contribute from the point.", filter: "all" },
        { title: "⭐ Star Player Impact", text: "Top scorers concentrate on the left faceoff circle and slot.", filter: "goals" },
        { title: "🎯 Breakaway & Rush Shots", text: "High-danger chances from in close. Goal conversion peaks near the net.", filter: "goals" },
        { title: "📈 Season Trends", text: "Later in season, players focus on high-percentage scoring areas.", filter: "non-goals" }
    ];

    const narrationContainer = document.querySelector(".scrollyteller__narration");
    narrationContainer.innerHTML = steps.map(step => `
        <div class="narration-step" data-step-filter="${step.filter}">
            <h2>${step.title}</h2>
            <p>${step.text}</p>
        </div>
    `).join('');

    const graphContainer = document.getElementById("st-graph");
    graphContainer.innerHTML = `
        <div class="graph-title">🏒 Shot Density – <span id="filter-label">All Shots</span></div>
        <div id="scrolly-graph"></div>
    `;
    renderContourPlot("scrolly-graph", "all");

    const scroller = scrollama();
    scroller
        .setup({
            step: ".narration-step",
            offset: 0.5,
            debug: false
        })
        .onStepEnter(response => {
            const filter = response.element.getAttribute("data-step-filter");
            const labelSpan = document.getElementById("filter-label");
            if (labelSpan) {
                labelSpan.innerText = filter === "all" ? "All Shots" :
                                      filter === "goals" ? "Goals Only" : "Missed/Saved";
            }
            renderContourPlot("scrolly-graph", filter);
        });

    window.addEventListener("resize", scroller.resize);
}

// ========================
// INITIALIZATION
// ========================
async function init() {
    const loaded = await loadShotData();
    if (loaded) {
        populateFilters();
        setupHeroListeners();
        renderHeroChart();
        await new Promise(r => setTimeout(r, 100));
        setupScrollama();
    }
}

init();