/* ═══════════════════════════════════════════════════════════
   ANÁLISIS DE TIROS NHL 2007–2025
   Scrollytelling con D3 + Scrollama
   ═══════════════════════════════════════════════════════════ */

import { parquetReadObjects } from 'hyparquet';

// ──────────────── CONSTANTS ────────────────
const RINK_IMAGE    = "hockeyRink.jpg";
const RINK_X_MIN   = 0;
const RINK_X_MAX   = 100;
const RINK_Y_MIN   = -42.5;
const RINK_Y_MAX   = 42.5;
const BANDWIDTH     = 10;
const THRESHOLD     = 8;
const MIN_SHOTS_PLAYERS = 100;
const MIN_SHOTS_GOALIES = 1000;

const COLOURS = {
    navy:       "#0a2647",
    steel:      "#205295",
    sky:        "#2c6faa",
    blue:       "#1e5a8c",
    lightBlue:  "#bad9f5",
    darkBlue:   "#08306b",
    red:        "#c0392b",
    darkRed:    "#7b1a1a",
    lightRed:   "#f8aca2",
    orange:     "#d97706",
    green:      "#0d7c3e",
    gold:       "#b8860b",
    grey:       "#6c757d",
    sourceBlue: "#1f77b4",
    targetRed:  "#d62728",
};

// ──────────────── GLOBAL ────────────────
let shotData = [];

// ──────────────── HELPERS ────────────────
const debounce = (fn, ms) => {
    let timer;
    return (...args) => { clearTimeout(timer); timer = setTimeout(() => fn(...args), ms); };
};

const linearRegression = (x, y) => {
    const n = x.length;
    if (n < 2) return null;
    let sx = 0, sy = 0, sxy = 0, sx2 = 0;
    for (let i = 0; i < n; i++) {
        sx += x[i]; sy += y[i]; sxy += x[i] * y[i]; sx2 += x[i] * x[i];
    }
    const slope = (n * sxy - sx * sy) / (n * sx2 - sx * sx);
    return { slope, intercept: (sy - slope * sx) / n };
};

const periodLabel = (p) => {
    const num = +p;
    if (num === 0 || num === 4) return "OT";
    if (num === 5) return "SO";
    return String(num || "");
};

const parseBool = (val) => {
    const s = String(val ?? "").trim().toLowerCase();
    return s === "true" || s === "1" || s === "yes" || s === "y";
};

const isReboundEvent = (cat) =>
    String(cat ?? "").trim().toUpperCase() === "SHOT";

// ──────────────── DATA LOADING ────────────────
// Helper: safely convert ANY value (float, int, BigInt, string, null) to a number
function safeNumber(val) {
    if (val === undefined || val === null || val === '') return 0;
    const num = Number(val);
    return isNaN(num) ? 0 : num;
}

function mapRowToShot(d) {
    return {
        // Coordinates (floats – safe, but safeNumber handles them anyway)
        coordX:  safeNumber(d.coordX) || safeNumber(d.arenaAdjustedXCordAbs) || 0,
        coordY:  safeNumber(d.coordY) || safeNumber(d.arenaAdjustedYCord) || 0,

        // Booleans / strings (unchanged)
        isGoal:  parseBool(d.goal),
        goal:    d.goal,
        shotType:           d.shotType            || "",
        season:             String(d.season || "").trim(), // season is safe
        isPlayoffGame:      parseBool(d.isPlayoffGame),

        // ⚠️ THE CULPRITS – these are often integers in Parquet:
        period:             safeNumber(d.period), // ← likely the one causing the error!
        time:               d.time                || "",
        timeUntilNextEvent: d.timeUntilNextEvent  || "",
        timeSinceLastEvent: d.timeSinceLastEvent  || "",
        timeSinceFaceoff:   d.timeSinceFaceoff    || "",
        shooterTimeOnIce:   d.shooterTimeOnIce    || "",
        shooterTimeOnIceSinceFaceoff: d.shooterTimeOnIceSinceFaceoff || "",
        lastEventCategory:  d.lastEventCategory   || "",
        lastEventTeam:      d.lastEventTeam       || "",
        lastEventXCord:     safeNumber(d.lastEventXCord),
        lastEventYCord:     safeNumber(d.lastEventYCord),
        lastEventDistance:  safeNumber(d.lastEventDistance),
        lastEventAngle:     safeNumber(d.lastEventAngle),
        shooterName:        d.shooterName         || "",
        goalieName:         d.goalieName          || "",
        shooterLeftRight:   d.shooterLeftRight    || "",
        shooterPosition:    d.shooterPosition     || "",
        shooterTeamCode:    d.shooterTeam         || "",
        goalieTeamCode:     d.goalieTeam          || "",
        onIceSituation:     d.onIceSituation      || "",
        shotOutcome:        d.shotOutcome         || "",
        shotOnEmptyNet:     d.shotOnEmptyNet      || "",
        shotRebound:        d.shotRebound         || "",
        shotRush:           d.shotRush            || "",
        shotWasOnGoal:      d.shotWasOnGoal       || "",
        shotGoalieFroze:    d.shotGoalieFroze     || "",
        shotPlayStopped:    d.shotPlayStopped     || "",
        shotGeneratedRebound: d.shotGeneratedRebound || "",
        offWing:            d.offWing             || "",
        shotDistance:       safeNumber(d.shotDistance),
        xGoal:              safeNumber(d.xGoal),
        xFroze:             safeNumber(d.xFroze),
        xRebound:           safeNumber(d.xRebound),
        xPlayStopped:       safeNumber(d.xPlayStopped),
        xShotWasOnGoal:     safeNumber(d.xShotWasOnGoal),

        // ⚠️ MORE CULPRITS (integers):
        homeTeamGoals:      safeNumber(d.homeTeamGoals),
        awayTeamGoals:      safeNumber(d.awayTeamGoals),

        shooterIsHomeTeam:  d.shooterIsHomeTeam   || "",
        shootingTeamWon:    d.shootingTeamWon     || "",
        speedFromLastEvent: d.speedFromLastEvent  || "",
        timeDifferenceSinceChange: d.timeDifferenceSinceChange || "",
        averageRestDifference:     d.averageRestDifference     || "",

        // ⚠️ RANK FIELDS – definitely integers:
        ShooterSeasonRank:   safeNumber(d.ShooterSeasonRank),
        shooterSeasonGoals:  safeNumber(d.shooterSeasonGoals),
        shooterShootingPct:  safeNumber(d.shooterShootingPct),
        goalieSeasonRank:    safeNumber(d.goalieSeasonRank),
        goalieSeasonWins:    safeNumber(d.goalieSeasonWins),
        goalieSavePct:       safeNumber(d.goalieSavePct),
        shooterTeamSeasonRank: safeNumber(d.shooterTeamSeasonRank),
        goalieTeamSeasonRank:  safeNumber(d.goalieTeamSeasonRank),
    };
}

// --- THE NEW loadShotData FUNCTION (reads Parquet) ---
async function loadShotData({ onProgress } = {}) {
    const seasons = Array.from({ length: 19 }, (_, i) => 2007 + i);
    const files = seasons.map(s => `data/shots_${s}.parquet`); // 👈 Changed extension

    // 1. Fetch ALL Parquet files in parallel (as ArrayBuffers)
    const fetchPromises = files.map(f => 
        fetch(f).then(r => {
            if (!r.ok) throw new Error(`HTTP ${r.status}`);
            return r.arrayBuffer(); // Get binary data
        })
    );
    const results = await Promise.allSettled(fetchPromises);

    // 2. Process them sequentially for predictable progress
    let allMappedData = [];

    for (let i = 0; i < files.length; i++) {
        const res = results[i];
        if (res.status !== "fulfilled") {
            console.warn(`Skipping ${files[i]}:`, res.reason);
            continue;
        }

        const arrayBuffer = res.value;

        // 3. Parse the Parquet binary into an array of row objects
        //    (hyparquet returns plain objects with column names as keys)
        let rows = [];
        try {
            rows = await parquetReadObjects({ file: arrayBuffer });
        } catch (err) {
            console.warn(`Failed to parse ${files[i]}:`, err);
            continue;
        }

        if (!rows || rows.length === 0) continue;

        // 4. Map the Parquet rows to your exact schema
        const mappedChunk = rows.map(mapRowToShot);
        allMappedData = allMappedData.concat(mappedChunk);

        // 5. Update progress (passes the full dataset so far)
        if (onProgress) {
            onProgress(i + 1, files.length, allMappedData);
        }

        // Yield to the event loop to keep UI responsive
        await new Promise(r => setTimeout(r, 0));
    }

    // 6. Assign to your global variable (if you have one)
    shotData = allMappedData; // or just `shotData = allMappedData;`

    return allMappedData.length > 0;
}

// ──────────────── SEASON METRICS ────────────────
function computeSeasonMetrics() {
    if (!shotData.length) return null;

    const build = (groups, mapper) => {
        const result = {};
        for (const [key, shots] of groups) {
            result[key] = mapper(shots, shots[0]);
        }
        return result;
    };

    const playerMapper = (shots, first) => {
        const avgXGoal = d3.mean(shots, d => +d.xGoal);
        const sumXGoal = d3.sum(shots, d => +d.xGoal);
        const rawPct   = +first.shooterShootingPct;
        const rebounds = shots.filter(d => isReboundEvent(d.lastEventCategory)).length;
        return {
            shooterSeasonRank:  +first.ShooterSeasonRank,
            shooterSeasonGoals: +first.shooterSeasonGoals,
            shooterShootingPct: isNaN(rawPct) ? null : rawPct / 100,
            avgXGoal, sumXGoal,
            shotCount:    shots.length,
            reboundRate:  shots.length ? rebounds / shots.length : null,
        };
    };

    const goalieMapper = (shots, first) => {
        const avgXGoal = d3.mean(shots, d => +d.xGoal);
        const sumXGoal = d3.sum(shots, d => +d.xGoal);
        const rawSave  = +first.goalieSavePct;
        const rebounds = shots.filter(d => isReboundEvent(d.lastEventCategory)).length;
        return {
            goalieSeasonRank: +first.goalieSeasonRank,
            goalieSeasonWins: +first.goalieSeasonWins,
            goalieSavePct:    isNaN(rawSave) ? null : rawSave / 100,
            avgXGoal, sumXGoal,
            shotCount:    shots.length,
            reboundRate:  shots.length ? rebounds / shots.length : null,
        };
    };

    const teamMapper = (shots, first, rankKey) => {
        const avgXGoal = d3.mean(shots, d => +d.xGoal);
        const sumXGoal = d3.sum(shots, d => +d.xGoal);
        const rebounds = shots.filter(d => isReboundEvent(d.lastEventCategory)).length;
        return {
            rank:       +first[rankKey],
            avgXGoal, sumXGoal,
            shotCount:  shots.length,
            reboundRate: shots.length ? rebounds / shots.length : null,
        };
    };

    return {
        players:       build(d3.group(shotData, d => `${d.shooterName}||${d.season}`), playerMapper),
        goalies:       build(d3.group(shotData, d => `${d.goalieName}||${d.season}`),   goalieMapper),
        teamsShooter:  build(d3.group(shotData, d => `${d.shooterTeamCode}||${d.season}`),
                             (s, f) => teamMapper(s, f, "shooterTeamSeasonRank")),
        teamsGoalie:   build(d3.group(shotData, d => `${d.goalieTeamCode}||${d.season}`),
                             (s, f) => teamMapper(s, f, "goalieTeamSeasonRank")),
    };
}

// ──────────────── HERO CHART ────────────────
const mapX = (x, w) => ((x - RINK_X_MIN) / (RINK_X_MAX - RINK_X_MIN)) * w;
const mapY = (y, h) => h * (RINK_Y_MAX - y) / (RINK_Y_MAX - RINK_Y_MIN);

function getHeroFilters() {
    const radio = (name) => document.querySelector(`input[name="${name}"]:checked`)?.value || "all";
    return {
        goalFilter:     radio("goal-result"),
        shotType:       document.getElementById("hero-shottype")?.value       || "all",
        season:         document.getElementById("hero-season")?.value         || "all",
        playoff:        radio("playoff"),
        period:         document.getElementById("hero-period")?.value         || "all",
        hand:           radio("hand"),
        onIceSituation: document.getElementById("hero-onicesituation")?.value || "all",
        shooterPosition:document.getElementById("hero-shooterposition")?.value || "all",
        shotOutcome:    document.getElementById("hero-shotoutcome")?.value    || "all",
        shooter:        document.getElementById("hero-shooter")?.value.trim().toLowerCase()    || "",
        goalie:         document.getElementById("hero-goalie")?.value.trim().toLowerCase()     || "",
        team:           document.getElementById("hero-team")?.value.trim().toLowerCase()       || "",
        goalieTeam:     document.getElementById("hero-goalieteam")?.value.trim().toLowerCase() || "",
    };
}

function applyHeroFilters(data, f) {
    let arr = [...data];
    if (f.goalFilter === "goals")     arr = arr.filter(d => d.isGoal);
    else if (f.goalFilter === "non-goals") arr = arr.filter(d => !d.isGoal);
    if (f.shotType       !== "all") arr = arr.filter(d => d.shotType        === f.shotType);
    if (f.season         !== "all") arr = arr.filter(d => d.season          === f.season);
    if (f.playoff        !== "all") arr = arr.filter(d => d.isPlayoffGame   === (f.playoff === "true"));
    if (f.period         !== "all") arr = arr.filter(d => periodLabel(d.period) === f.period);
    if (f.hand           !== "all") arr = arr.filter(d => d.shooterLeftRight === f.hand);
    if (f.onIceSituation !== "all") arr = arr.filter(d => d.onIceSituation  === f.onIceSituation);
    if (f.shooterPosition!== "all") arr = arr.filter(d => d.shooterPosition === f.shooterPosition);
    if (f.shotOutcome    !== "all") arr = arr.filter(d => d.shotOutcome     === f.shotOutcome);
    if (f.shooter)    arr = arr.filter(d => d.shooterName.toLowerCase().includes(f.shooter));
    if (f.goalie)     arr = arr.filter(d => d.goalieName.toLowerCase().includes(f.goalie));
    if (f.team)       arr = arr.filter(d => d.shooterTeamCode.toLowerCase().includes(f.team));
    if (f.goalieTeam) arr = arr.filter(d => d.goalieTeamCode.toLowerCase().includes(f.goalieTeam));
    return arr;
}

function renderHeroChart() {
    if (!shotData.length) return;
    const filters  = getHeroFilters();
    const filtered = applyHeroFilters(shotData, filters);
    const container = d3.select("#hero-chart");
    const legendEl  = document.getElementById("hero-legend");
    container.html("");

    if (!filtered.length) {
        container.append("p").style("text-align","center").style("color","#475569")
            .text("Ningún tiro coincide con los filtros seleccionados.");
        if (legendEl) legendEl.innerHTML = "";
        return;
    }

    const W = 800, H = 680;
    const mx = x => mapX(x, W), my = y => mapY(y, H);
    const svg = container.append("svg")
        .attr("viewBox", `0 0 ${W} ${H}`).attr("preserveAspectRatio", "xMidYMid meet");

    svg.append("image").attr("href", RINK_IMAGE).attr("width", W).attr("height", H)
        .attr("preserveAspectRatio", "none").style("opacity", 0.85);

    const geoPath = d3.geoPath();

    const drawContours = (data, colourLow, colourHigh, fillOpacity, strokeColour) => {
        if (!data.length) return;
        const pts = data.map(d => [mx(d.coordX), my(d.coordY)]);
        const density = d3.contourDensity().x(d => d[0]).y(d => d[1])
            .size([W, H]).bandwidth(BANDWIDTH).thresholds(THRESHOLD);
        const contours = density(pts);
        const pos = contours.filter(c => c.value > 0);
        const low  = pos.length ? d3.min(pos, c => c.value) : 0.001;
        const high = d3.max(contours, c => c.value) || 0.01;
        const scale = d3.scaleSequentialLog().domain([low, high])
            .interpolator(d3.interpolateRgbBasis([colourLow, colourHigh]));
        svg.append("g").selectAll("path").data(contours).enter().append("path")
            .attr("d", geoPath).attr("fill", d => scale(d.value))
            .attr("fill-opacity", fillOpacity).attr("stroke", strokeColour).attr("stroke-width", 0.7);
    };

    const showGoals    = filters.goalFilter !== "non-goals";
    const showNonGoals = filters.goalFilter !== "goals";
    if (showGoals)    drawContours(filtered.filter(d => d.isGoal),  "#bad9f5", "#08306b", 0.85, "#1d4ed8");
    if (showNonGoals) drawContours(filtered.filter(d => !d.isGoal), "#f8aca2", "#670c00", 0.35, "#cbd5e1");

    if (legendEl) {
        legendEl.innerHTML = `
            <div class="legend-title">Densidad de tiros</div>
            <div class="legend-gradient-group"><div class="legend-label">Goles</div>
                <div class="legend-gradient-bar" style="background:linear-gradient(to right,#deebf7,#08306b)"></div></div>
            <div class="legend-gradient-group"><div class="legend-label">Fallados / Atajados</div>
                <div class="legend-gradient-bar" style="background:linear-gradient(to right,#fee0d2,#67001f)"></div></div>
            <div class="shots-count">Tiros: ${filtered.length.toLocaleString("es-ES")}</div>`;
    }
}

function populateFilters() {
    if (!shotData.length) return;
    const uniq = (fn) => [...new Set(shotData.map(fn).filter(Boolean))].sort();
    const populateSelect = (id, values, label = "Todos") => {
        const sel = document.getElementById(id);
        if (!sel) return;
        sel.innerHTML = `<option value="all">${label}</option>`;
        values.forEach(v => { const o = document.createElement("option"); o.value = v; o.textContent = v; sel.appendChild(o); });
    };
    const populateDatalist = (id, values) => {
        const dl = document.getElementById(id);
        if (!dl) return;
        dl.innerHTML = "";
        values.forEach(v => { const o = document.createElement("option"); o.value = v; dl.appendChild(o); });
    };

    populateSelect("hero-shottype",        uniq(d => d.shotType));
    populateSelect("hero-season",          uniq(d => d.season).sort((a,b) => a - b));
    populateSelect("hero-period",          uniq(d => periodLabel(d.period)).sort((a,b) => ({"1":1,"2":2,"3":3,"OT":4,"SO":5}[a]||99) - ({"1":1,"2":2,"3":3,"OT":4,"SO":5}[b]||99)));
    populateSelect("hero-onicesituation",  uniq(d => d.onIceSituation));
    populateSelect("hero-shooterposition", uniq(d => d.shooterPosition));
    populateSelect("hero-shotoutcome",     uniq(d => d.shotOutcome));

    populateDatalist("shooter-list",     uniq(d => d.shooterName));
    populateDatalist("goalie-list",      uniq(d => d.goalieName));
    populateDatalist("team-list",        uniq(d => d.shooterTeamCode));
    populateDatalist("goalieteam-list",  uniq(d => d.goalieTeamCode));
}

function setupHeroListeners() {
    const update = debounce(renderHeroChart, 200);
    ["hero-shottype","hero-season","hero-period","hero-onicesituation","hero-shooterposition","hero-shotoutcome"]
        .forEach(id => document.getElementById(id)?.addEventListener("change", renderHeroChart));
    document.querySelectorAll('input[name="goal-result"], input[name="playoff"], input[name="hand"]')
        .forEach(r => r.addEventListener("change", renderHeroChart));
    ["hero-shooter","hero-goalie","hero-team","hero-goalieteam"].forEach(id => {
        document.getElementById(id)?.addEventListener("input", update);
        document.getElementById(id)?.addEventListener("change", renderHeroChart);
    });
}

// ──────────────── SCROLLYTELLER 1: HISTORICAL CONTOURS ────────────────
function renderContourPlot(containerId, filterType, options = {}) {
    if (!shotData.length) return;
    const { width = 600, height = 510, seasonStart, seasonEnd, legendId } = options;
    let filtered = [...shotData];
    if (seasonStart != null && seasonEnd != null)
        filtered = filtered.filter(d => { const s = +d.season; return s >= seasonStart && s <= seasonEnd; });
    if (filterType === "goals")     filtered = filtered.filter(d => d.isGoal);
    if (filterType === "non-goals") filtered = filtered.filter(d => !d.isGoal);

    const container = d3.select(`#${containerId}`).html("");
    const W = width, H = height;
    const mx = x => mapX(x, W), my = y => mapY(y, H);
    const svg = container.append("svg").attr("viewBox", `0 0 ${W} ${H}`)
        .attr("preserveAspectRatio", "xMidYMid meet").attr("width", W).attr("height", H);
    svg.append("image").attr("href", RINK_IMAGE).attr("width", W).attr("height", H)
        .attr("preserveAspectRatio", "none").style("opacity", 0.85);

    const geoPath = d3.geoPath();
    let goalMin, goalMax, nonMin, nonMax;

    const draw = (data, lowC, highC, fillOp, strokeC) => {
        if (!data.length) return;
        const pts = data.map(d => [mx(d.coordX), my(d.coordY)]);
        const contours = d3.contourDensity().x(d => d[0]).y(d => d[1])
            .size([W, H]).bandwidth(BANDWIDTH).thresholds(THRESHOLD)(pts);
        const pos = contours.filter(c => c.value > 0);
        const lo = pos.length ? d3.min(pos, c => c.value) : 0.001;
        const hi = d3.max(contours, c => c.value) || 0.01;
        const scale = d3.scaleSequentialLog().domain([lo, hi])
            .interpolator(d3.interpolateRgbBasis([lowC, highC]));
        svg.append("g").selectAll("path").data(contours).enter().append("path")
            .attr("d", geoPath).attr("fill", d => scale(d.value))
            .attr("fill-opacity", fillOp).attr("stroke", strokeC).attr("stroke-width", 0.7);
        return { lo, hi };
    };

    if (filterType === "all" || filterType === "goals") {
        const r = draw(filtered.filter(d => d.isGoal), "#bad9f5", "#08306b", 0.85, "#1d4ed8");
        if (r) { goalMin = r.lo; goalMax = r.hi; }
    }
    if (filterType === "all" || filterType === "non-goals") {
        const r = draw(filtered.filter(d => !d.isGoal), "#f8aca2", "#670c00", 0.35, "#cbd5e1");
        if (r) { nonMin = r.lo; nonMax = r.hi; }
    }

    if (legendId) {
        const el = document.getElementById(legendId);
        if (el) {
            const bar = (label, c1, c2) =>
                `<div class="legend-label">${label}</div><div class="legend-gradient-bar" style="background:linear-gradient(to right,${c1},${c2})"></div>`;
            el.innerHTML = `<div class="legend-gradient-group">${goalMin != null ? bar("Goles","#deebf7","#08306b") : ""}</div>
                <div class="legend-gradient-group">${nonMin != null ? bar("Fallados","#fee0d2","#67001f") : ""}</div>
                <div class="shots-count">Tiros: ${filtered.length.toLocaleString("es-ES")}</div>`;
        }
    }
}

async function setupScrollama1() {
    const allSeasons = [...new Set(shotData.map(d => d.season).filter(Boolean))].map(Number).sort((a,b)=>a-b);
    if (!allSeasons.length) return;

    const seasonSteps = [
        {
            title: "Temporadas 2007 – 2010",
            text: "De 2007 a 2010, en la liga se jugaba mediante una táctica basada en el volumen de tiros, donde no se renunciaba a ninguna oportunidad para tirar. Estos disparos se distribuían por toda la zona ofensiva, con una preferencia clara cerca de la red, pero en la que podemos ver otras zonas de alta densidad a larga distancia, cuya ubicación suele asociarse a tiros de los defensores.",
            start: 2007,
            end: 2010
        },
        {
            title: "Temporadas 2011 – 2014",
            text: "Entre 2011 y 2014, se empieza a observar un ligero cambio. El volumen total de disparos disminuye, y lo hace principalmente en los disparos de larga distancia. Sin embargo, no se aprecia una compensación con más tiros desde cerca. Los analistas han empezado a hacer su trabajo, y la orden de los entrenadores es clara, hay que renunciar a algunos disparos de larga distancia en favor de mejores oportunidades, pero los jugadores aún no se han adaptado",
            start: 2011,
            end: 2014
        },
        {
            title: "Temporadas 2015 – 2019",
            text: "De 2015 a 2019, la revolución analítica se implanta de lleno. El volumen de tiros total aumenta considerablemente, incluso a valores superiores a los de 2010, los jugadores se han empezado a adaptar y vemos como la densidad así lo refleja cerca de la portería, no obstante, aún se observan zonas de media densidad a larga distancia, aún quedan jugadores de la vieja escuela, que se oponen el cambio.",
            start: 2015,
            end: 2019
        },
        {
            title: "Temporadas 2020 – 2025",
            text: "La era moderna del hockey, con una adaptación completa e incluso dependiente de los datos, el volumen de tiros llega a su máximo, y así lo hacen también los goles, la densidad de disparos se concentra en las zonas de mayor calidad de disparos, y se vive la mejor era ofensiva de este deporte en muchos años.",
            start: 2020,
            end: 2025
        }
    ];

    document.getElementById("narration1").innerHTML = seasonSteps.map(step => `
        <div class="narration-step" data-start="${step.start}" data-end="${step.end}">
            <h2>${step.title}</h2>
            <p>${step.text}</p>
        </div>
    `).join('');

    document.getElementById("st-graph").innerHTML = `
        <div class="graph-title">Densidad de Tiros – <span id="filter-label">${seasonSteps[0].title}</span></div>
        <div id="scrolly-legend1" class="chart-legend2"></div>
        <div id="scrolly-graph"></div>
    `;

    renderContourPlot("scrolly-graph", "all", {
        seasonStart: seasonSteps[0].start,
        seasonEnd: seasonSteps[0].end,
        legendId: "scrolly-legend1"
    });

    const scroller = scrollama();
    scroller.setup({ step: "#narration1 .narration-step", offset: 0.5, debug: false })
        .onStepEnter(response => {
            const start = +response.element.dataset.start;
            const end   = +response.element.dataset.end;
            const step  = seasonSteps.find(s => s.start === start && s.end === end);
            if (step) {
                document.getElementById("filter-label").innerText = step.title;
            }
            renderContourPlot("scrolly-graph", "all", {
                seasonStart: start,
                seasonEnd: end,
                legendId: "scrolly-legend1"
            });
        });

    window.addEventListener("resize", scroller.resize);
}

// ──────────────── SCROLLYTELLER 2: ADVANCED METRICS HEATMAPS ────────────────
function renderHeatmap(containerId, metric) {
    if (!shotData.length) return;
    const W = 600, H = 510, BIN = 20;
    const cols = Math.ceil(W / BIN), rows = Math.ceil(H / BIN);
    const bins = new Array(cols * rows).fill(null).map(() => ({ sum:0, count:0 }));

    for (const d of shotData) {
        if (d.coordX > 89) continue;
        const x = mapX(d.coordX, W), y = mapY(d.coordY, H);
        if (x < 0 || x >= W || y < 0 || y >= H) continue;
        const idx = Math.floor(y / BIN) * cols + Math.floor(x / BIN);
        bins[idx].sum += d[metric] || 0;
        bins[idx].count++;
    }

    const avgs = bins.filter(b => b.count > 0).map(b => b.sum / b.count);
    if (!avgs.length) {
        d3.select(`#${containerId}`).html("<p style='text-align:center;color:#555'>Sin datos para esta métrica</p>");
        return;
    }
    let mn = d3.min(avgs), mx = d3.max(avgs);
    if (mn === mx) { mn -= 0.001; mx += 0.001; }
    const colour = d3.scaleSequential(d3.interpolateYlOrRd).domain([mn, mx]);

    const svg = d3.select(`#${containerId}`).html("").append("svg")
        .attr("viewBox", `0 0 ${W} ${H}`).attr("preserveAspectRatio", "xMidYMid meet").attr("width", W).attr("height", H);
    svg.append("image").attr("href", RINK_IMAGE).attr("width", W).attr("height", H)
        .attr("preserveAspectRatio", "none").style("opacity", 0.85);

    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
        const b = bins[r * cols + c];
        if (!b.count) continue;
        svg.append("rect").attr("x", c*BIN).attr("y", r*BIN).attr("width", BIN).attr("height", BIN)
            .attr("fill", colour(b.sum / b.count)).attr("opacity", 0.7);
    }

    const leg = document.getElementById("scrolly-legend2");
    if (leg) leg.innerHTML = `<div class="legend-gradient-group"><div class="legend-label">${metric}</div>
        <div class="legend-gradient-bar" style="background:linear-gradient(to right,${colour(mn)},${colour(mx)})"></div>
        <div class="legend-range"><span>${mn.toFixed(4)}</span><span>${mx.toFixed(4)}</span></div></div>`;
}

async function setupScrollama2() {
    const metrics = [
        { id:"xGoal",          title:"Probabilidad de gol (xGoal)",          text:"La probabilidad de gol se concentra justo frente a la red y decae rápidamente con la distancia y el ángulo." },
        { id:"xRebound",       title:"Probabilidad de generar rebote (xRebound)",               text:"Los disparos desde cerca son los que más rebotes generan, aunque también se observa un aumento considerable en la probabilidad de los disparos con poco ángulo (cercanos a la línea de gol), y los disparos de larga distancia." },
        { id:"xShotWasOnGoal", title:"Probabilidad de tiro a puerta (xShotWasOnGoal)",  text:"La probabilidad de que el tiro vaya a portería generalmente alta en casi todas partes, debido al alto nivel de los jugadores, sin embargo aún se puede apreciar ligeramente el aumento justo en frente de la portería, y un ligero decrecimiento con la distancia." },
    ];

    document.getElementById("narration2").innerHTML = metrics.map(m =>
        `<div class="narration-step2" data-metric="${m.id}"><h2>${m.title}</h2><p>${m.text}</p></div>`).join("");
    document.getElementById("st-graph2").innerHTML = `
        <div class="graph-title">Mapa de Calor – <span id="filter-label2">${metrics[0].title}</span></div>
        <div id="scrolly-legend2" class="chart-legend2"></div><div id="scrolly-graph2"></div>`;

    renderHeatmap("scrolly-graph2", metrics[0].id);

    const scroller = scrollama();
    scroller.setup({ step: "#narration2 .narration-step2", offset: 0.5, debug: false })
        .onStepEnter(resp => {
            const m = resp.element.dataset.metric;
            const meta = metrics.find(x => x.id === m);
            document.getElementById("filter-label2").innerText = meta ? meta.title : m;
            renderHeatmap("scrolly-graph2", m);
        });
    window.addEventListener("resize", scroller.resize);
}

// ──────────────── SCROLLYTELLER 3: FLOW MAPS ────────────────
const CATEGORY_LABELS = {
    "SHOT":"Tiro","MISSED_SHOT":"Tiro fallado","BLOCKED_SHOT":"Tiro bloqueado","GOAL":"Gol",
    "HIT":"Golpe / Carga","GIVEAWAY":"Pérdida de disco","TAKEAWAY":"Recuperación de disco",
    "FACEOFF":"Faceoff","PENALTY":"Penalización","DELPEN":"Penalización retrasada",
    "STOP":"Parada del juego","PERIOD_END":"Fin del periodo","GAME_END":"Fin del partido",
    "OFFSIDE":"Fuera de juego","ICING":"Icing","FACEOFF_WIN":"Faceoff ganado",
};

function renderFlowMap(containerId, category, dataSource) {
    if (!dataSource?.length) return;
    const W = 600, H = 510, BIN = 15;
    const cols = Math.ceil(W / BIN), rows = Math.ceil(H / BIN);

    const filtered = dataSource.filter(d => {
        if (!d.lastEventCategory || d.lastEventCategory !== category) return false;
        const lx = +d.lastEventXCord, ly = +d.lastEventYCord, sx = +d.coordX, sy = +d.coordY;
        return ![lx, ly, sx, sy].some(isNaN);
    });

    const svg = d3.select(`#${containerId}`).html("").append("svg")
        .attr("viewBox", `0 0 ${W} ${H}`).attr("preserveAspectRatio", "xMidYMid meet").attr("width", W).attr("height", H);
    svg.append("image").attr("href", RINK_IMAGE).attr("width", W).attr("height", H)
        .attr("preserveAspectRatio", "none").style("opacity", 0.85);

    if (!filtered.length) {
        svg.append("text").attr("x",W/2).attr("y",H/2).attr("text-anchor","middle").attr("fill","#555")
            .text("No hay datos para esta categoría");
        return;
    }

    const bins = new Map();
    filtered.forEach(d => {
        const ox = Math.floor(mapX(+d.lastEventXCord, W) / BIN);
        const oy = Math.floor(mapY(+d.lastEventYCord, H) / BIN);
        const dx = Math.floor(mapX(+d.coordX, W) / BIN);
        const dy = Math.floor(mapY(+d.coordY, H) / BIN);
        if ([ox,oy,dx,dy].some(v => v<0 || v>= (v===ox||v===dx?cols:rows))) return;
        const key = `${ox},${oy}-${dx},${dy}`;
        bins.set(key, (bins.get(key)||0) + 1);
    });

    const maxCount = Math.max(...bins.values(), 1);
    const safeMax  = maxCount > 1 ? maxCount : 2;
    const widthS   = d3.scaleSqrt().domain([1, safeMax]).range([0.5, 5]);
    const opacityS = d3.scaleLog().domain([1, safeMax]).range([0.2, 0.8]).clamp(true);
    const defs = svg.append("defs");

    bins.forEach((count, key) => {
        const [orig, dest] = key.split("-");
        const [ox, oy] = orig.split(",").map(Number);
        const [dx, dy] = dest.split(",").map(Number);
        const x1 = ox*BIN + BIN/2, y1 = oy*BIN + BIN/2;
        const x2 = dx*BIN + BIN/2, y2 = dy*BIN + BIN/2;
        const midX = (x1+x2)/2 + (ox-dx)*0.3, midY = (y1+y2)/2 + (oy-dy)*0.3;
        const gid = `g-${ox}-${oy}-${dx}-${dy}`;
        defs.append("linearGradient").attr("id",gid).attr("gradientUnits","userSpaceOnUse")
            .attr("x1",x1).attr("y1",y1).attr("x2",x2).attr("y2",y2)
            .selectAll("stop").data([{o:"0%",c:COLOURS.sourceBlue},{o:"100%",c:COLOURS.targetRed}])
            .enter().append("stop").attr("offset",d=>d.o).attr("stop-color",d=>d.c);
        svg.append("path").attr("d",`M${x1},${y1} Q${midX},${midY} ${x2},${y2}`)
            .attr("class","flow-line").attr("stroke",`url(#${gid})`)
            .attr("stroke-width",widthS(count)).attr("opacity",opacityS(count));
    });

    const leg = document.getElementById("scrolly-legend3");
    if (leg) leg.innerHTML = `<div class="legend-gradient-group">
        <div class="legend-label">Flujo de tiros (${filtered.length.toLocaleString("es-ES")} disparos)</div>
        <div style="display:flex;align-items:center;gap:0.4rem;margin:0.2rem 0">
            <span style="display:inline-block;width:18px;height:8px;background:${COLOURS.sourceBlue}"></span><span style="font-size:0.65rem">Posición evento anterior</span>
            <span style="display:inline-block;width:18px;height:8px;background:${COLOURS.targetRed}"></span><span style="font-size:0.65rem">Posición tiro</span></div>
        <div class="legend-range"></div></div>`;
}

function setupScrollama3() {
    let source = shotData.filter(d => d.isPlayoffGame);
    let sourceLabel = "playoffs";
    if (!source.length) {
        source = shotData;
        sourceLabel = "toda la temporada (no se encontraron playoffs)";
    }

    const FLOW_CATEGORIES = [
        { id: "SHOT",          title: "Tiro que genera rebote",                text: "Estos disparos que generan rebote tras una parada son especialmente interesantes analíticamente, ya que con el portero en una posición desfavorable, el siguiente disparo tiene más probabilidades de ser exitoso." },
        { id: "MISS",   title: "Tiro fallado",        text: "Un tiro que no va a puerta a menudo rebota lejos de la acción debido a la alta velocidad y al hielo resbaladizo." },
        { id: "BLOCK",  title: "Tiro bloqueado",      text: "Cuando un defensor bloquea el tiro, el disco puede generar un rebote o salir despedido fuera de la zona azul, desde donde el ataque tendrá que volver a empezar de cero." },
        { id: "HIT",           title: "Hit",       text: "Un golpe puede liberar el disco y cambiar la posesión, iniciando una transición rápida hacia la portería, en ocasiones con un defensor fuera de posición." },
        { id: "FAC",       title: "Faceoff",             text: "El faceoff es una jugada ensayada; los equipos ganan la posesión y disparan desde posiciones predefinidas." },
    ];

    const steps = [];
    for (const config of FLOW_CATEGORIES) {
        const count = source.filter(d => d.lastEventCategory === config.id).length;
        if (count > 0) {
            steps.push({
                category: config.id,
                title: `${config.title} (${config.id})`,
                text: config.text,
                count: count
            });
        }
    }

    // Construir la narración
    document.getElementById("narration3").innerHTML = steps.map(step => `
        <div class="narration-step3" data-category="${step.category}">
            <h2>${step.title}</h2>
            <p>${step.text} <br><small>(${step.count.toLocaleString("es-ES")} disparos en ${sourceLabel})</small></p>
        </div>
    `).join('');

    // Preparar el gráfico
    document.getElementById("st-graph3").innerHTML = `
        <div class="graph-title">Flujo Pre‑Tiro – <span id="filter-label3">${steps[0].title}</span></div>
        <div id="scrolly-legend3" class="chart-legend2"></div>
        <div id="scrolly-graph3"></div>
    `;

    renderFlowMap("scrolly-graph3", steps[0].category, source);

    const scroller = scrollama();
    scroller.setup({ step: "#narration3 .narration-step3", offset: 0.5, debug: false })
        .onStepEnter(response => {
            const cat = response.element.dataset.category;
            const step = steps.find(s => s.category === cat);
            if (step) {
                document.getElementById("filter-label3").innerText = step.title;
            }
            renderFlowMap("scrolly-graph3", cat, source);
        });

    window.addEventListener("resize", scroller.resize);
}

// ──────────────── SCROLLYTELLER 4: SCATTERPLOTS ────────────────
function renderScatterplots(containerId, dataArray, plotConfigs) {
    const container = d3.select(`#${containerId}`).html("");
    if (!dataArray?.length) { container.append("p").style("text-align","center").text("No hay datos."); return; }
    const grid = container.append("div").attr("class","scatter-grid");

    plotConfigs.forEach(cfg => {
        const xKey = cfg.xKey || "avgXGoal";
        const valid = dataArray.filter(d =>
            d[xKey] != null && d[cfg.yKey] != null && isFinite(d[xKey]) && isFinite(d[cfg.yKey]));
        if (valid.length < 5) return;

        const W = 440, H = 300, margin = { top:25, right:25, bottom:48, left:60 };
        const div = grid.append("div").attr("class","scatter-plot");
        div.append("div").style("text-align","center").style("font-weight","bold").style("font-size","0.85rem").text(cfg.yLabel);
        const svg = div.append("svg").attr("width",W).attr("height",H);

        const xExt = d3.extent(valid, d => d[xKey]);
        const yExt = d3.extent(valid, d => d[cfg.yKey]);
        const pad = (ext) => (ext[1]-ext[0])*0.05 || 0.1;
        const xDom = [xExt[0]-pad(xExt), xExt[1]+pad(xExt)];
        const yDom = [yExt[0]-pad(yExt), yExt[1]+pad(yExt)];

        const xS = d3.scaleLinear().domain(xDom).range([margin.left, W-margin.right]).nice();
        const yS = d3.scaleLinear().domain(yDom)
            .range(cfg.invertY ? [margin.top, H-margin.bottom] : [H-margin.bottom, margin.top]).nice();

        svg.append("g").attr("transform",`translate(0,${H-margin.bottom})`).call(d3.axisBottom(xS).ticks(5));
        svg.append("g").attr("transform",`translate(${margin.left},0)`).call(d3.axisLeft(yS).ticks(5));

        const xLabel = xKey==="avgXGoal"?"xGoal medio por tiro":xKey==="sumXGoal"?"xGoals":
                       xKey==="reboundRate"?"Tasa de rebotes":xKey==="diffReboundRate"?"Dif. tasa rebotes (ataq−def)":"Dif. xGoal medio (ataq−def)";
        svg.append("text").attr("x",W/2).attr("y",H-6).attr("text-anchor","middle").style("font-size","0.7rem").text(xLabel);
        svg.append("text").attr("transform","rotate(-90)").attr("x",-H/2).attr("y",14).attr("text-anchor","middle").style("font-size","0.7rem").text(cfg.yLabel);

        svg.selectAll("circle").data(valid).enter().append("circle")
            .attr("cx",d=>xS(d[xKey])).attr("cy",d=>yS(d[cfg.yKey])).attr("r",3)
            .attr("fill",COLOURS.sky).attr("opacity",0.7);

        if (valid.length > 2) {
            const reg = linearRegression(valid.map(d=>d[xKey]), valid.map(d=>d[cfg.yKey]));
            if (reg) {
                const y1 = reg.slope*xDom[0]+reg.intercept, y2 = reg.slope*xDom[1]+reg.intercept;
                svg.append("line").attr("x1",xS(xDom[0])).attr("y1",yS(y1)).attr("x2",xS(xDom[1])).attr("y2",yS(y2))
                    .attr("stroke",COLOURS.red).attr("stroke-width",2).attr("stroke-dasharray","5,3");
            }
        }
    });
}

function setupScrollama4() {
    const m = computeSeasonMetrics();
    if (!m) return;

    const toArray = (obj) => Object.entries(obj).map(([k,v]) => ({...v, key:k}));
    const players  = toArray(m.players).filter(d => d.shotCount >= MIN_SHOTS_PLAYERS && d.avgXGoal != null);
    const goalies  = toArray(m.goalies).filter(d => d.shotCount >= MIN_SHOTS_GOALIES && d.avgXGoal != null);

    const teams = [];
    for (const [k, sv] of Object.entries(m.teamsShooter)) {
        const gv = m.teamsGoalie[k];
        if (!gv) continue;
        teams.push({
            key:k,
            diffAvgXGoal: sv.avgXGoal - gv.avgXGoal,
            diffReboundRate: (sv.reboundRate ?? 0) - (gv.reboundRate ?? 0),
            shooterTeamSeasonRank: sv.rank,
        });
    }

    const steps = [
        { title:"Jugadores de campo –> xGoal vs rendimiento",
          text:"Unos tiros desde zonas de mayor calidad, se reflejan en un mejor porcentaje de acierto a lo largo de la temporada. Lo que sumado a lo largo de la temporada, y a un volumen de tiros que lo acompañe, acaba resultando también más goles",
          data:players, plots:[
              {yKey:"shooterSeasonGoals",yLabel:"Goles",xKey:"sumXGoal"},
              {yKey:"shooterShootingPct",yLabel:"% de tiro",xKey:"avgXGoal"}]},
        { title:"Jugadores de campo –> Impacto de los rebotes",
          text:"Los tiradores que realizan tiros después de un rebote, suelen estar en las zonas correctas, o aprovecharse de una mala situación del portero, lo que también influye positivamente tanto en su porcentaje de tiro como en su número total de goles.",
          data:players, plots:[
              {yKey:"shooterSeasonGoals",yLabel:"Goles",xKey:"reboundRate"},
              {yKey:"shooterShootingPct",yLabel:"% de tiro",xKey:"reboundRate"}]},
        { title:"Porteros – xGoal en contra vs rendimiento",
          text:"Unos tiros desde zonas de mayor calidad en contra (más peligrosos), se reflejan obviamente en un peor porcentaje de paradas, sin embargo esta influencia no es tan grande en el número de victorias. Esto es normal ya que los porteros no suelen jugar el mismo número de partidos, y dependen de sus jugadores de campo marcando goles para obtener las victorias.",
          data:goalies, plots:[
              {yKey:"goalieSeasonWins",yLabel:"Victorias",xKey:"avgXGoal"},
              {yKey:"goalieSavePct",yLabel:"% de paradas",xKey:"avgXGoal"}]},
        { title:"Porteros – Impacto de los rebotes",
          text:"Cuando un portero enfrenta más tiros de rebote, su porcentaje de paradas disminuye. De nuevo el número de victorias no se ve tan afectado debido a las mismas causas mencionadas con anterioridad.",
          data:goalies, plots:[
              {yKey:"goalieSeasonWins",yLabel:"Victorias",xKey:"reboundRate"},
              {yKey:"goalieSavePct",yLabel:"% de paradas",xKey:"reboundRate"}]},
        { title:"Clasificación de Equipos – Balance ofensivo‑defensivo",
          text:"La métrica a observar en estos gráficos es la diferencia entre la calidad de los disparos generados por un equipo, y la calidad de los tiros en contra hacia su portero. Podemos observar que esta métrica tiene una correlacción altísima con la clasificación final del equipo, mejorando la clasificación a medida que mejora la calidad de los tiros propios. También calculamos la diferencia entre ataque y defensa con la tasa de rebotes, con la que se observa que la influencia en la clasificación es menor pero no nula.",
          data:teams, plots:[
              {yKey:"shooterTeamSeasonRank",yLabel:"Ranking",xKey:"diffAvgXGoal",invertY:true},
              {yKey:"shooterTeamSeasonRank",yLabel:"Ranking",xKey:"diffReboundRate",invertY:true}]},
    ];

    document.getElementById("narration4").innerHTML = steps.map((s,i) =>
        `<div class="narration-step4" data-step="${i}"><h2>${s.title}</h2><p>${s.text}</p></div>`).join("");
    document.getElementById("st-graph4").innerHTML = `<div id="scrolly-graph4" style="width:100%"></div>`;

    renderScatterplots("scrolly-graph4", steps[0].data, steps[0].plots);

    const scroller = scrollama();
    scroller.setup({ step:"#narration4 .narration-step4", offset:0.5, debug:false })
        .onStepEnter(resp => {
            const s = steps[+resp.element.dataset.step];
            renderScatterplots("scrolly-graph4", s.data, s.plots);
        });
    window.addEventListener("resize", scroller.resize);
}

// ──────────────── SECTION 5: PLAYER CAREER CHARTS ────────────────
function renderPlayerCareerCharts(containerId, playerName, metrics) {
    const container = d3.select(`#${containerId}`);
    const playerData = Object.entries(metrics.players)
        .map(([k,v]) => { const [name,season] = k.split("||"); return {...v, name, season:+season}; })
        .filter(d => d.name === playerName && d.season >= 2013)
        .sort((a,b) => a.season - b.season);

    if (!playerData.length) {
        container.html("<p style='text-align:center;padding:2rem'>No hay datos para este jugador.</p>");
        return;
    }

    container.html(`
        <div class="mini-chart" id="chart-xgoal-pct" style="width:380px;height:300px"></div>
        <div class="mini-chart" id="chart-sumxgoal-goals" style="width:380px;height:300px"></div>
    `);

    const seasons = playerData.map(d => d.season);
    const W = 380, H = 260, margin = { top:25, right:30, bottom:45, left:55 };

    function drawChart(divId, k1, l1, c1, k2, l2, c2, fmt) {
        const svg = d3.select(`#${divId}`).html("").append("svg")
            .attr("viewBox",`0 0 ${W} ${H}`).attr("preserveAspectRatio","xMidYMid meet")
            .attr("width","100%").attr("height","100%");

        const xS = d3.scalePoint().domain(seasons.map(String))
            .range([margin.left, W-margin.right]).padding(0.5);

        const allVals = playerData.flatMap(d => [d[k1],d[k2]]).filter(v => v!=null && isFinite(v));
        const ext = d3.extent(allVals);
        const yS = d3.scaleLinear().domain([ext[0]*0.9, ext[1]*1.1])
            .range([H-margin.bottom, margin.top]).nice();

        svg.append("g").attr("transform",`translate(0,${H-margin.bottom})`)
            .call(d3.axisBottom(xS).tickValues(seasons.filter(s=>s%2===0).map(String)));
        svg.append("g").attr("transform",`translate(${margin.left},0)`)
            .call(d3.axisLeft(yS).ticks(5).tickFormat(d3.format(fmt)));

        const drawLine = (key, col) => {
            const vd = playerData.filter(d => d[key]!=null && isFinite(d[key]));
            if (vd.length < 2) return;
            const line = d3.line().x(d=>xS(String(d.season))).y(d=>yS(d[key])).curve(d3.curveMonotoneX);
            svg.append("path").datum(vd).attr("fill","none").attr("stroke",col).attr("stroke-width",2.5).attr("d",line);
            svg.selectAll(`.d-${key}`).data(vd).enter().append("circle")
                .attr("cx",d=>xS(String(d.season))).attr("cy",d=>yS(d[key])).attr("r",3.5).attr("fill",col);
        };

        drawLine(k1, c1);
        drawLine(k2, c2);

        const leg = svg.append("g").attr("transform",`translate(${margin.left+8},${margin.top+8})`);
        [{k:k1,l:l1,c:c1},{k:k2,l:l2,c:c2}].forEach((item,i) => {
            const y = i*20;
            leg.append("line").attr("x1",0).attr("x2",18).attr("y1",y).attr("y2",y).attr("stroke",item.c).attr("stroke-width",2.5);
            leg.append("text").attr("x",24).attr("y",y+4).text(item.l).style("font-size","0.7rem").attr("fill","#333");
        });
    }

    drawChart("chart-xgoal-pct",     "avgXGoal","xGoal prom.",COLOURS.blue,
              "shooterShootingPct","% tiro",COLOURS.orange,".2f");
    drawChart("chart-sumxgoal-goals","sumXGoal","xGoal total",COLOURS.blue,
              "shooterSeasonGoals","Goles",COLOURS.green,"d");
}

// ──────────────── INIT ────────────────
async function init() {
    const overlay = document.getElementById("loading-overlay");
    if (overlay) overlay.classList.add("show");

    const loaded = await loadShotData({
        onProgress: (done, total) => {
            const pct = Math.round((done/total)*100);
            const el = overlay?.querySelector(".loading-text");
            if (el) el.textContent = `Cargando datos… ${pct}%`;
        }
    });

    if (overlay) overlay.classList.remove("show");
    if (!loaded) return;
    console.log("Sample shotData[0]:", shotData[0]);
    console.log("Unique lastEventCategory values:", 
        [...new Set(shotData.map(d => d.lastEventCategory).filter(Boolean))]
    );

    populateFilters();
    setupHeroListeners();
    renderHeroChart();

    const delay = ms => new Promise(r => setTimeout(r, ms));
    await delay(100); setupScrollama2();
    await delay(100); setupScrollama1();
    await delay(100); setupScrollama3();
    await delay(100); setupScrollama4();
    await delay(100);
    renderPlayerCareerCharts("mackinnon-charts", "Nathan MacKinnon", computeSeasonMetrics());
}

init();