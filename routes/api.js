const express = require('express');
const router = express.Router();
const mariadb = require('mariadb');
const config = require("../config.json");
const url = require('url');

const fetch = require('node-fetch');
const DOMParser = require('dom-parser');
const sizeOf = require('image-size');
const isAbsoluteUrl = require('is-absolute-url');

const pool = mariadb.createPool({
    host: config.host,
    port: config.port,
    user: config.user,
    password: config.password,
    database: config.database
});

/****  STATEMENTS ****/
const SQL_PERSON = `SELECT p.* FROM person p WHERE p.F41 = ?`;

const SQL_PERSONS_X_ROYALCOURT_IN_TIMERANGE =
        `SELECT h.* FROM person p 
     JOIN transkriptionen t ON p.F41 = t.F41
     JOIN hofstaat h ON t.Hofherr = h.Hofherr
     WHERE t.Dienstbeginn > ? AND t.Dienstbeginn < ?`;

const SQL_COUNT_PERSONS_X_ROYALCOURT_IN_TIMERANGE =
    `SELECT ph.Bezeichnung, COUNT(ph.Hofherr), ph.F41
     FROM (${SQL_PERSONS_X_ROYALCOURT_IN_TIMERANGE}) AS ph
     GROUP BY ph.Hofherr`;

const SQL_PERSONS_OF_ROYALCOURT_IN_TIMERANGE =
        `SELECT DISTINCT p.* FROM person p 
     JOIN transkriptionen t ON p.F41 = t.F41 
     JOIN hofstaat h ON t.Hofherr = h.Hofherr 
     WHERE h.F41 = ?
     AND t.Dienstbeginn > ? AND t.Dienstbeginn < ?`;

const SQL_PARENTS =
        `SELECT parent.* FROM person p 
    JOIN beziehung b ON p.F41 = b.F41Y 
    JOIN person parent ON parent.F41=b.F41X
    WHERE b.ART = 1 
    AND p.F41 = ?`;

const SQL_CHILDREN =
        `SELECT child.* FROM person p 
    JOIN beziehung b ON p.F41 = b.F41X 
    JOIN person child ON child.F41 = b.F41Y 
    WHERE b.ART = 1 
    AND p.F41 = ?`;

const SQL_CHILDREN_OF_SPOUSE =
        `SELECT child.* FROM person p 
    JOIN beziehung b ON p.F41 = b.F41X 
    JOIN person child ON child.F41 = b.F41Y 
    JOIN beziehung bSpouse ON child.F41 = bSpouse.F41Y 
    JOIN person spouse ON spouse.F41 = bSpouse.F41X
    WHERE b.ART = 1 
    AND bSpouse.ART = 1 
    AND p.F41 = ?
    AND spouse.F41 = ?`;

const SQL_WIFES =
        `SELECT wife.* FROM person p
    JOIN beziehung b ON p.F41 = b.F41X 
    JOIN person wife ON wife.F41 = b.F41Y 
    WHERE b.ART = 2 
    AND p.F41 = ?`;

const SQL_HUSBANDS =
        `SELECT husband.* FROM person p 
    JOIN beziehung b ON p.F41 = b.F41Y 
    JOIN person husband ON husband.F41 = b.F41X 
    WHERE b.ART = 2 
    AND p.F41 = ?`;

const SQL_RECORDS_MIN_DATE =
        `SELECT MIN(Dienstbeginn) AS \`MIN(Records)\` FROM transkriptionen WHERE Dienstbeginn<>''`;

const SQL_RECORDS_MAX_DATE =
        `SELECT MAX(Dienstbeginn)  AS \`MAX(Records)\` FROM transkriptionen WHERE Dienstbeginn<>'' `;

// LX = left join
const SQL_PERSON_LX_IMAGE = `SELECT pSelect.*, img.Source  FROM ({0}) AS pSelect LEFT JOIN bild img ON pSelect.F41 = img.F41`;

const SQL_IMAGES = `SELECT * FROM bild`;

const SQL_SET_IMAGE_SOURCE = `UPDATE bild SET Source = ? WHERE F41 = ?`;

/* GET home page. */
router.post('/', async function (req, res, next) {
    // console.log(req.body);
    const selector = req.body.selector;
    const table = req.body.table;

    const sql = `SELECT ${selector} FROM ${table}`;
    const data = await getFromDB(sql);
    // console.log(data);
    await res.json(data);
});

router.post('/sql/:stmt', async function (req, res, next) {
    let sql = '';
    let params = [];
    switch (req.params.stmt) {
        case 'COUNT-PERSONS-X-ROYALCOURT-IN-TIMERANGE':
            sql = SQL_COUNT_PERSONS_X_ROYALCOURT_IN_TIMERANGE;
            if (req.body.hasOwnProperty('startYear')) {
                params.push(req.body.startYear);
            }
            if (req.body.hasOwnProperty('endYear')) {
                params.push(req.body.endYear);
            }
            break;
        case 'PERSONS-OF-ROYALCOURT-IN-TIMERANGE':
            sql = SQL_PERSONS_OF_ROYALCOURT_IN_TIMERANGE;
            if (req.body.hasOwnProperty('personID')) {
                params.push(req.body.personID);
            }
            if (req.body.hasOwnProperty('startYear')) {
                params.push(req.body.startYear);
            }
            if (req.body.hasOwnProperty('endYear')) {
                params.push(req.body.endYear);
            }
            break;
        case 'PERSON':
            sql = SQL_PERSON_LX_IMAGE.format(SQL_PERSON);
            if (req.body.hasOwnProperty('personID')) {
                params.push(req.body.personID);
            }
            break;
        case 'PARENTS':
            sql = SQL_PERSON_LX_IMAGE.format(SQL_PARENTS);
            if (req.body.hasOwnProperty('personID')) {
                params.push(req.body.personID);
            }
            break;
        case 'CHILDREN':
            sql = SQL_PERSON_LX_IMAGE.format(SQL_CHILDREN);
            if (req.body.hasOwnProperty('personID')) {
                params.push(req.body.personID);
            }
            break;
        case 'CHILDREN-OF-SPOUSE':
            sql = SQL_PERSON_LX_IMAGE.format(SQL_CHILDREN_OF_SPOUSE);
            if (req.body.hasOwnProperty('personID')) {
                params.push(req.body.personID);
            }
            if (req.body.hasOwnProperty('spouseID')) {
                params.push(req.body.spouseID);
            }
            break;
        case 'HUSBANDS':
            sql = SQL_PERSON_LX_IMAGE.format(SQL_HUSBANDS);
            if (req.body.hasOwnProperty('personID')) {
                params.push(req.body.personID);
            }
            break;
        case 'WIFES':
            sql = SQL_PERSON_LX_IMAGE.format(SQL_WIFES);
            if (req.body.hasOwnProperty('personID')) {
                params.push(req.body.personID);
            }
            break;
        case 'RECORDS-MIN-DATE':
            sql = SQL_RECORDS_MIN_DATE;
            break;
        case 'RECORDS-MAX-DATE':
            sql = SQL_RECORDS_MAX_DATE;
            break;
        default:
            sql = `SELECT * FROM person`;
    }
    const data = await getFromDB(sql, params);
    await res.json(data);
});

/**
 * Extract image source from bild.link in database and write in bild.source.
 */
router.get('/extractPersonImageSource', async function (req, res, next) {
    let updateAll = false;

    const images = await getFromDB(SQL_IMAGES);
    for (let i = 0; i < images.length; i++) {
        const img = images[i];
        if (img.Link && img.F41) {
            if (!img.Source || updateAll) {
                try {
                    let imgSourceUrl = await getImgSourceUrlFromImgLink(img.Link);
                    if (imgSourceUrl) {
                        console.log(`Person: ${img.F41}, Source: ${imgSourceUrl}`);
                        await getFromDB(SQL_SET_IMAGE_SOURCE, [imgSourceUrl, img.F41])
                    } else {
                        console.log(`Failure - Url has no valid image: Person: ${img.F41}, Link: ${img.Link}`);
                    }
                } catch (e) {
                    console.log(e.stack);
                    console.log(img)
                }
            }
        }
    }
    console.log('Finished person image source extraction!');
    res.send('SUCCESSFULLY extracted image source from image url. Wrote in Database: table "bild", column: "Source".');
});

async function getImgSourceUrlFromImgLink(originalUrl) {
    originalUrl = encodeURI(originalUrl);
    let html = await (await fetch(originalUrl)).text();

    const parser = new DOMParser();
    const doc = parser.parseFromString(html, "text/html");

    const imgElements = doc.getElementsByTagName('img');
    let largestResolution = 0;
    let largestImgSource = null;

    // Go through all image urls of the site to get the right / largest one.
    for (let i = 0; i < imgElements.length; i++) {
        const imgElement = imgElements[i];
        let imgSourceUrl = imgElement.getAttribute('src');
        if (!isAbsoluteUrl(imgSourceUrl)) {
            if(imgSourceUrl.startsWith('//'))
                imgSourceUrl = imgSourceUrl.replace('//', 'https://');
            else {
                // if(originalUrl.endsWith('/')) {
                //     originalUrl = originalUrl.substr(0, originalUrl.length - 1);
                // }
                if(imgSourceUrl.startsWith('/')) {
                    imgSourceUrl = imgSourceUrl.substr(1, originalUrl.length);
                }
                let jUrl = url.parse(originalUrl)
                imgSourceUrl = jUrl.protocol + '//' + jUrl.hostname + '/' + imgSourceUrl;
            }
            // console.log(imgSourceUrl);
        }
        if(isAbsoluteUrl(imgSourceUrl)) {
            try {
                const response = await fetch(imgSourceUrl);
                const buffer = await response.buffer();
                const dimensions = await sizeOf(buffer);
                //console.log(dimensions);

                const resolution = dimensions.width * dimensions.height;
                if (resolution > largestResolution) {
                    largestResolution = resolution;
                    largestImgSource = imgSourceUrl;
                }
            } catch (e) {
                // Image url is not an image
                // console.log(`ImageUrl does not link to image: ${imgSourceUrl} on site ${url}`);
            }
        }
    }
    return largestImgSource;
}

async function getFromDB(sql, params = []) {
    let conn;
    try {
        conn = await pool.getConnection();
        const rows = await conn.query(sql, params);
        return rows;
    } catch (err) {
        throw err;
    } finally {
        if (conn) {
            await conn.end();
            conn.release();
        }
    }
    return false;
}

module.exports = router;