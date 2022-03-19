const model = {};
const hints = {};
const hint_similarities = {};


/////////////////////////////
// Load data
/////////////////////////////

async function init(onProgress) {
    const sql = await initSqlJs({
        locateFile: file => `./js/sqljs-wasm/${file}`
    });

    // fetch all files in parallel, then join at the end
    const promises = []

    // track progress
    let total = 0;
    let completed = 0;

    // Turn the fetch response into a Uint8Array in a way that allows tracking progress
    const readResponse = async (response) => {
        const size = Number(response.headers.get("Content-Length"));
        total += size;

        const result = new Uint8Array(size);
        let pointer = 0;

        const reader = response.body.getReader();
        while (true) {
            const {value, done} = await reader.read();
            if (done) {
                break;
            }
            result.set(value, pointer);
            pointer += value.length;
            completed += value.length;
            onProgress(completed, total);
        }

        return result;
    };

    // model
    for (const letterRange of ["a-c", "d-h", "i-o", "p-r", "s-z"]) {
        const wordVecPromise = fetch(`data/word2vec_${letterRange}.db`)
        .then(readResponse)
        .then(file => {
            const db = new sql.Database(file);
            const results = db.exec("SELECT * FROM word2vec")[0].values;
            for (const [word, vec] of results) {
                model[word] = blobToVector(vec);
            }
        });
        promises.push(wordVecPromise);
    }

    // hints
    const hintsPromise = fetch("data/hints.db")
    .then(readResponse)
    .then(file => {
        const db = new sql.Database(file);
        const results = db.exec("SELECT * FROM hints")[0].values;
        for (const tuple of results) {
            hints[tuple[0]] = tuple.slice(1);
        }
    });
    promises.push(hintsPromise);

    // hint similarities
    const similaritiesPromise = fetch("data/hint_similarities.db")
    .then(readResponse)
    .then(file => {
        const db = new sql.Database(file);
        const results = db.exec("SELECT * FROM similarities")[0].values;
        for (const tuple of results) {
            const word = tuple.shift();
            for (let i = 0; i < tuple.length; i++) {
                tuple[i] = new DataView(tuple[i].buffer).getFloat32(0, true);
            }
            hint_similarities[word] = tuple;
        }
    });
    promises.push(similaritiesPromise);

    // join all promises
    return Promise.all(promises);
}

function blobToVector(blob) {
    const dv = new DataView(blob.buffer);
    const vec = []
    for (let i = 0; i < 300; i++) {
        vec[i] = dv.getFloat32(i*4, true);
    }
    return vec
}


/////////////////////////////
// Vector math
/////////////////////////////

function mag(a) {
    return Math.sqrt(a.reduce(function(sum, val) {
        return sum + val * val;
    }, 0));
}

function dot(f1, f2) {
    return f1.reduce(function(sum, a, idx) {
        return sum + a*f2[idx];
    }, 0);
}

function getCosSim(f1, f2) {
    return dot(f1,f2)/(mag(f1)*mag(f2));
}


/////////////////////////////
// Helpers
/////////////////////////////

function getPercentile(secret, guess) {
    const index = hints[secret].indexOf(guess);
    return index === -1 ? null : index + 1;
}


/////////////////////////////
// Game functions
/////////////////////////////

function getSimilarityStory(word) {
    return {
        top: hint_similarities[word][998],
        top10: hint_similarities[word][989],
        rest: hint_similarities[word][0]
    };
}

function getSimilarity(secret, guess) {
    if (secret === guess) {
        return [100, 1000];
    }

    const secret_vec = model[secret];
    const guess_vec = model[guess];
    if (guess_vec === undefined) {
        return [null, null];
    }

    const similarity = getCosSim(secret_vec, guess_vec) * 100;
    const percentile = getPercentile(secret, guess);
    return [similarity, percentile];
}

export default {init, getSimilarityStory, getSimilarity};
