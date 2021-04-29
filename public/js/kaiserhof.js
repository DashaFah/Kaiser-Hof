import postData from "./client-api.js";


// Workaround to load sass colors
let div = document.createElement('div');
document.body.appendChild(div);
div.className = "primary";
const primary_color = getComputedStyle(div).backgroundColor;
div.className = "secondary";
const secondary_color = getComputedStyle(div).backgroundColor;
div.className = "man";
const man_color = getComputedStyle(div).backgroundColor;
div.className = "woman";
const woman_color = getComputedStyle(div).backgroundColor;
document.body.removeChild(div);

d3.selection.prototype.moveToFront = function() {
    return this.each(function() {
        this.parentNode.appendChild(this);
    });
};

/**
 * Mode which determines, if bubbles represent a royal house hold (state) or persons data of selected royal household.
 * @type {string}
 */
let mMode = 'count';
let mCurrentPersonID = null;
let mSvg = null;

initBubbles();

const resetBtn = document.getElementById('resetBtn');
resetBtn.addEventListener('click', () => {
    updateBubblesByMode(null, null, 'count');
    updateFamilyTree();
});

/**
 * Init bubble chart and time slider.
 */
async function initBubbles() {
    const minDate = new Date((await postData('/api/sql/RECORDS-MIN-DATE'))[0]['MIN(Records)']);
    const maxDate = new Date((await postData('/api/sql/RECORDS-MAX-DATE'))[0]['MAX(Records)']);

    const startYear = minDate.getFullYear();
    const endYear = maxDate.getFullYear();

    await initBubbleChart(startYear, endYear);
    await initBubbleSlider(minDate.getFullYear(), maxDate.getFullYear(), startYear, endYear);
}

/**
 * Init the bubble chart visualization.
 *
 * @param startYear the start year to filter
 * @param endYear   the end year to filter
 */
async function initBubbleChart(startYear, endYear) {
    const width = 1000;
    const height = 1000;

    mSvg = d3.create("svg")
        .attr("viewBox", [0, 0, width, height])
        .attr("font-size", 10)
        .attr("font-family", "sans-serif")
        .attr("text-anchor", "middle");

    const bubbleChart = await updateBubblesByMode(startYear, endYear, 'count');

    // Remove previous bubble charts and append current
    d3.select("#bubbles").html("");
    d3.select("#bubbles").append(() => bubbleChart);
}

async function updateBubblesByMode(startYear = null, endYear = null, newMode = null) {
    if (newMode)
        mMode = newMode;
    if (!startYear || !endYear) {
        const sliderValues = getBubbleSliderValues();
        startYear = sliderValues[0];
        endYear = sliderValues[1];
    }

    if (mMode === 'count') {
        return await updateCountOfRoyalCourtBubbles(mSvg, startYear, endYear);
    } else if (mMode === 'persons') {
        return await updatePersonsOfRoyalCourtBubbles(mSvg, startYear, endYear, mCurrentPersonID);
    }
}

/**
 * Update the bubble chart with count of royal court.
 *
 * @param svg       the parent svg element
 * @param startYear the start year to filter
 * @param endYear   the end year to filter
 */
async function updateCountOfRoyalCourtBubbles(svg, startYear, endYear) {
    let res = await postData('/api/sql/COUNT-PERSONS-X-ROYALCOURT-IN-TIMERANGE', {
        startYear: startYear,
        endYear: endYear
    });

    // Convert database data object to bubble data object
    const data = res.map(obj => {
        const count = obj['COUNT(ph.Hofherr)'];
        return {
            name: obj['Bezeichnung'] + ': ' + count,
            title: obj['Bezeichnung'],
            group: count, // Groups it by count
            value: obj['COUNT(ph.Hofherr)'],
            personID: obj['F41'],
        }
    });
    return await updateBubbles(svg, data, primary_color);
}

/**
 * Update the bubble chart with persons of royal court.
 *
 * @param svg       the parent svg element
 * @param startYear the start year to filter
 * @param endYear   the end year to filter
 */
async function updatePersonsOfRoyalCourtBubbles(svg, startYear, endYear, personID) {
    let res = await postData('/api/sql/PERSONS-OF-ROYALCOURT-IN-TIMERANGE', {
        personID: personID,
        startYear: startYear,
        endYear: endYear
    });

    // Convert database data object to bubble data object
    const data = res.map(obj => {
        return {
            name: obj['ZLabel'] || obj['F41'],
            title: obj['ZLabel'] || obj['F41'],
            group: obj['F24'] === 'm' ? man_color : (obj['F24'] === 'w' ? woman_color : 'grey'),
            value: 5,
            personID: obj['F41'],
        }
    });
    return await updateBubbles(svg, data, null);
}

/**
 * Update the bubble chart.
 *
 * @param svg               the parent svg element
 * @param data              the formatted bubble data
 * @param gradientColor     the color gradient of bubble categories
 */
function updateBubbles(svg, data, gradientColor) {
    // Read dimensions from svg view box
    const viewbox = svg.attr("viewBox").split(/[ ,]+/);
    const width = viewbox[2];
    const height = viewbox[3];
    const format = d3.format(",d");

    // Distribute colors through all possible groups
    let maxVal = d3.max(data.map(d => d.group));

    // Try different color maps
    // d3.scaleOrdinal(data.map(d => d.group), d3.schemeCategory10)
    // d3.scaleOrdinal(data.map(d => d.group), d3.schemeDark2)
    let toColorGradient;
    if (gradientColor) {
        if (data.length > 0)
            toColorGradient = d3.scaleLinear().domain([1, maxVal * 1.5]).range(['black', gradientColor]);
        else
            toColorGradient = (color = null) => color || gradientColor;
    } else {
        toColorGradient = (color = null) => color || 'black';
    }

    // transition
    let t = d3.transition().duration(750);
    let tBounce = d3.transition().duration(500).ease(d3.easeBounce);

    // PACK
    const pack = data => {
        const hierarchy = d3.hierarchy({ children: data }).sum(d => d.value);
        const d3Pack = d3.pack().size([width - 2, height - 2]).padding(3);
        return d3Pack(hierarchy);
    };

    // BUBBLE CHART
    const root = pack(data);

    {
        // ENTER

        const enter = getLeaves(svg, root).enter();

        const leaf = enter.append("g").attr("transform", d => `translate(${d.x + 1},${d.y + 1})`);
        leaf.append("circle")
            .attr("id", d => (d.leafUid = generateUID('leaf')).id)
            .attr("fill-opacity", 0.7)
            .on("mouseover", function() {
                d3.select(this)
                    .interrupt()
                    .transition(tBounce)
                    .attr("fill-opacity", 0.8)
                    .attr("fill", secondary_color)
                    .attr("r", d => calculateHoverBubbleRadius(d.r));
                updateBubbleText(this, true, tBounce);
            })
            .on("mouseout", function() {
                d3.select(this)
                    .interrupt()
                    .transition(tBounce)
                    .attr("r", d => d.r)
                    .attr("fill", d => toColorGradient(d.data.group))
                    .attr("fill-opacity", 0.7);
                updateBubbleText(this, false, tBounce);
            })
            .on("click", function(d) {
                mCurrentPersonID = d.data.personID;
                updateFamilyTree(d.data.personID);
                if (mMode === 'count') {
                    updateBubblesByMode(null, null, 'persons')
                } else {
                    // Reset previous selected persons
                    svg.selectAll("g")
                        .select("circle")
                        .interrupt()
                        .style("fill", d => toColorGradient(d.data.group));
                    // Mark persons which is selected
                    d3.select(this)
                        .style("fill", secondary_color)
                }
            });

        leaf.append("clipPath")
            .attr("id", d => (d.clipUid = generateUID('clip')).id)
            .append("use")
            .attr("xlink:href", d => d.leafUid.href);

        leaf.append("text")
            //.attr("clip-path", d => d.clipUid)
            .style("fill", 'transparent')
            .style("font-size", 14)
            .style("pointer-events", 'none'); // Hide name of small yards (staff of lord / Hof)

        leaf.append("title")
            .text(d => `${d.data.title}\n${format(d.value)}`);
    }
    if (data.length > 0) {
        // UPDATE
        //FIXME also should handle with data.length == 0

        const update = getLeaves(svg, root);

        update.call(update => update.transition(t)
            .attr("transform", d => `translate(${d.x + 1},${d.y + 1})`));
        update.select("circle")
            .call(update => update.transition(t)
                .attr("fill", d => toColorGradient(d.data.group))
                .attr("r", d => d.r || 0));
        update.select("text")
            .call(update => update.transition(t)
                .style("fill", d => (d.r > 50 ? 'white' : 'transparent')));
        update.select("text")
            .selectAll("tspan")
            .data(d => d.data.name.split(/(?=[A-Z][^A-Z])/g)) // Split in multiple lines
            .join("tspan")
            .attr("x", 0)
            .attr("y", (d, i, nodes) => `${i - nodes.length / 2 + 0.8}em`) // position lines
            .text(d => d);
    } {
        // EXIT

        const exit = getLeaves(svg, root).exit();

        exit.select("circle")
            .call(exit => exit.transition(t)
                .attr("r", 0)
                .remove());
        exit.select("text")
            .call(exit => exit.transition(t)
                .style("fill", 'transparent')
                .remove());
        exit.call(exit => exit.transition(t)
            .remove());
    }

    return svg.node();
}

function getLeaves(svg, root) {
    return svg.selectAll("g")
        .data(root.leaves(), function(d) {
            return d ? d.data.personID : this.id;
        });
}

function calculateHoverBubbleRadius(r) {
    return Math.min(1000 / r, 50) + r;
}

/**
 * @param circle the circle node
 * @param t the transition
 * @param flag - true: mouseover, false: mouseout
 */
function updateBubbleText(circle, flag, t) {
    d3.select(circle.parentNode)
        .moveToFront()
        .select('text')
        .interrupt() // Interrupt previous animations
        .transition(t)
        .style("fill", d => (
            (flag ? calculateHoverBubbleRadius(d.r) : d.r) > 50 ? 'white' : 'transparent')) // Hide name of small yards (staff of lord / Hof)
        //.style("font-size", function(d) { return Math.max(calculateHoverBubbleRadius(d.r) / 10, 14 ) + "px"; });
}

/**
 * Init the slider to change date range in royal court.
 *
 * @param minYear   min val of date range
 * @param maxYear   max val of date range
 * @param startYear start val of date slider
 * @param endYear   end val of date slider
 */
async function initBubbleSlider(minYear, maxYear, startYear, endYear) {
    const slider = document.getElementById('slider');

    const dateFilter = (value, type) => {
        return value % 100 === 0 ? 1 : ((value % 10 === 0) ? 2 : ((value % 5 === 0) ? 0 : -1));
    };

    noUiSlider.create(slider, {
        start: [startYear, endYear],
        connect: true,
        range: {
            'min': minYear,
            'max': maxYear
        },
        step: 1,
        format: {
            // 'to' the formatted value. Receives a number.
            to: function(value) {
                return value.toFixed(0);
            },
            // 'from' the formatted value.
            // Receives a string, should return a number.
            from: function(value) {
                return Number(value);
            }
        },
        tooltips: true,
        pips: {
            mode: 'steps',
            stepped: true,
            filter: dateFilter,
            density: 3,
        }
    });
    slider.noUiSlider.on("update", throttle((values, handle, unencoded, tap, positions) => {
        updateBubblesByMode(parseInt(values[0]), parseInt(values[1]));
    }, 300));
    slider.noUiSlider.on("end", (values, handle, unencoded, tap, positions) => {
        updateBubblesByMode(parseInt(values[0]), parseInt(values[1]));
    });
}

function getBubbleSliderValues() {
    const slider = document.getElementById('slider');
    return slider.noUiSlider.get().map(v => parseInt(v));
}

/**
 * Throttles down a function call.
 *
 * @param func      the function to throttle down
 * @param limit     the time in ms
 */
const throttle = (func, limit) => {
    let inThrottle = false;
    return function() {
        const args = arguments;
        const context = this;
        if (!inThrottle) {
            func.apply(context, args);
            inThrottle = true;
            setTimeout(() => inThrottle = false, limit);
        }
    }
};

/**
 * Updates the family tree.
 *
 * @param personID  the id of the person in the database
 */
async function updateFamilyTree(personID = null) {
    d3.select("#familyTree").html("");
    if (!personID) return;
    console.log(personID);
    // See https://github.com/ErikGartner/dTree#usage
    let persons = await postData('/api/sql/PERSON', { personID: personID });
    let parents = await postData('/api/sql/PARENTS', { personID: personID });
    let spouses = await postData('/api/sql/WIFES', { personID: personID });
    spouses = spouses.concat(await postData('/api/sql/HUSBANDS', { personID: personID }));

    spouses = mapToDTreePersons(spouses);
    let marriages = [];
    for (let i = 0; i < spouses.length; i++) {
        let spouse = spouses[i];
        let children = await postData('/api/sql/CHILDREN-OF-SPOUSE', {
            personID: personID,
            spouseID: spouse.id
        });
        marriages.push({
            spouse: spouse,
            children: mapToDTreePersons(children),
        });
    }

    let person = mapToDTreePersons(persons)[0];
    person.marriages = marriages;
    person.class = person.class + ' selected';

    let data;

    // Add parents if present, and use them as root node.
    if (parents.length > 0) {
        parents = mapToDTreePersons(parents);
        let parent = parents[0];
        let relativesOfParent = {};
        relativesOfParent.children = [person];
        if (parents.length > 1) {
            relativesOfParent.spouse = parents[1];
        } else {
            relativesOfParent.spouse = {
                name: '',
                class: parent.class === "man" ? "woman" : "man",
            };
        }
        parent.marriages = [relativesOfParent];
        data = [parent];
    } else {
        data = [person];
    }

    // Remove old children before initialisation
    let dimension = document.getElementById("familyTree").clientWidth;
    dTree.init(data, {
        target: "#familyTree",
        debug: false,
        height: dimension,
        width: dimension,
        nodeWidth: 150,
        callbacks: {
            nodeClick: function(name, extra) {
                if (extra && extra.id)
                    updateFamilyTree(extra.id);
            },
            textRenderer: function(name, extra, textClass) {
                // THis callback is optinal but can be used to customize
                // how the text is rendered without having to rewrite the entire node
                // from screatch.
                let htmlText = '';
                if (extra) {
                    // if(!extra.imageUrl)
                    //     extra.imageUrl = 'http://www.bildarchivaustria.at/Bildarchiv//700/B7864844T7864848.jpg';
                    if (extra.nickname)
                        name = name + " (" + extra.nickname + ")";
                    if (extra.imageUrl) {
                        htmlText += `<div style="background-image: url(${extra.imageUrl});" class="familyTreeImage"></div>`;
                    }
                }
                htmlText += `<p align='center' class='${textClass}'>${name}</p>`;
                /*if (extra) {
                    if (extra.birthDate) htmlText += `<p align='center' class='${textClass}'>Birth Date: ${extra.birthDate}</p>`;
                    if (extra.birthPlace) htmlText += `<p align='center' class='${textClass}'>Birth Place: ${extra.birthPlace}</p>`;
                    if (extra.deathDate) htmlText += `<p align='center' class='${textClass}'>Death Date: ${extra.deathDate}</p>`;
                    if (extra.deathPlace) htmlText += `<p align='center' class='${textClass}'>Death Place: ${extra.deathPlace}</p>`;
                    if (extra.funeralPlace) htmlText += `<p align='center' class='${textClass}'>Funeral Place: ${extra.funeralPlace}</p>`;
                }*/

                return htmlText;
            },
            nodeRenderer: function(name, x, y, height, width, extra, id, nodeClass, textClass, textRenderer) {
                // This callback is optional but can be used to customize the
                // node element using HTML.
                let node = `<div style="height:100%; width:100%;" class="${nodeClass}" id="node ${id}">`;
                node += textRenderer(name, extra, textClass);
                node += `</div>`;
                return node;
            }
        }
    });
}

/**
 * Converts person from database to dTree format.
 *
 * @param persons the persons in database format
 * @returns the persons in dTree format
 */
function mapToDTreePersons(persons) {
    return persons.map(obj => {
        return {
            id: obj['F41'],
            gender: obj['F24'],
            birthDate: obj['F13'],
            birthPlace: obj['F15'],
            deathDate: obj['F14'],
            deathPlace: obj['F17'],
            funeralPlace: obj['F16'],
            comment: obj['Kommentar'],

            name: obj['ZLabel'] || obj['F41'],
            class: obj['F24'] === 'm' ? 'man' : (obj['F24'] === 'w' ? 'woman' : 'neutral'), // The CSS class of the node
            //textClass: "emphasis", // The CSS class of the text in the node
            //depthOffset: 1,        // Generational height offset
            extra: {
                id: obj['F41'],
                imageUrl: obj['Source'] || null,
                birthDate: obj['F13'],
                birthPlace: obj['F15'],
                deathDate: obj['F14'],
                deathPlace: obj['F17'],
                funeralPlace: obj['F16'],
                comment: obj['Kommentar']
            } // Custom data passed to renderers
        }
    });
}

function generateUID(name = '') {
    // I generate the UID from two parts here
    // to ensure the random number provide enough bits.
    var firstPart = (Math.random() * 46656) | 0;
    var secondPart = (Math.random() * 46656) | 0;
    firstPart = ("000" + firstPart.toString(36)).slice(-3);
    secondPart = ("000" + secondPart.toString(36)).slice(-3);
    return name + firstPart + secondPart;
}