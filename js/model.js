let sql;


async function init() {
    sql = await initSqlJs({
        locateFile: file => `./js/sqljs-wasm/${file}`
    });
}

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


function blobToVector(blob) {
    const dv = new DataView(blob.buffer);
    const vec = []
    for (let i = 0; i < 300; i++) {
        vec[i] = dv.getFloat32(i*4, true);
    }
    return vec
}

async function getVector(word) {
    let range;
    if ("abc".includes(word[0])) {
        range = "a-c";
    } else if ("defgh".includes(word[0])) {
        range = "d-h";
    } else if ("ijklmno".includes(word[0])) {
        range = "i-o";
    } else if ("pqr".includes(word[0])) {
        range = "p-r";
    } else if ("stuvwxyz".includes(word[0])) {
        range = "s-z";
    } else {
        return null;
    }
    const path = `data/word2vec_${range}.db`;
    const response = await fetch(path);
    const file = new Uint8Array(await response.arrayBuffer());
    const db = new sql.Database(file);
    const result = db.exec("SELECT vec FROM word2vec WHERE word = ?", [word]);
    if (result.length == 0) {
        return null;
    }
    const blob = result[0].values[0][0];
    const vec = blobToVector(blob);
    db.close();
    return vec;
}

async function getPercentile(secret, guess) {
    const file = new Uint8Array(await (await fetch("data/hints.db")).arrayBuffer());
    const db = new sql.Database(file);
    const hints = db.exec("SELECT * FROM hints WHERE secret = ?", [secret])[0].values[0].slice(1);
    const index = hints.indexOf(guess);
    db.close();
    return index === -1 ? null : index + 1;
}


async function getSimilarityStory(word) {
    const file = new Uint8Array(await (await fetch("data/hint_similarities.db")).arrayBuffer());
    const db = new sql.Database(file);
    const similarities = db.exec("SELECT * FROM similarities WHERE secret = ?", [word])[0].values[0].slice(1);
    db.close();
    return {
        top: new DataView(similarities[998].buffer).getFloat32(0, true),
        top10: new DataView(similarities[989].buffer).getFloat32(0, true),
        rest: new DataView(similarities[0].buffer).getFloat32(0, true)
    };
}

async function getSimilarity(secret, guess) {
    if (secret === guess) {
        return [1.0, 1000];
    }

    const secret_vec = await getVector(secret);
    const guess_vec = await getVector(guess);
    if (secret_vec === null || guess_vec === null) {
        return [null, null];
    }

    const similarity = getCosSim(secret_vec, guess_vec) * 100;
    const percentile = await getPercentile(secret, guess);
    return [similarity, percentile];
}

export default {init, getSimilarityStory, getSimilarity};
