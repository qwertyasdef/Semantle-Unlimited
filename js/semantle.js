/*
    Copyright (c) 2022, David Turner <novalis@novalis.org>

     This program is free software: you can redistribute it and/or modify it under the terms of the GNU General Public License as published by the Free Software Foundation, version 3.

    This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU General Public License for more details.

    You should have received a copy of the GNU General Public License along with this program. If not, see <https://www.gnu.org/licenses/>.
*/
'use strict';

import model from './model.js';


/////////////////////////////
// Initialization
/////////////////////////////

const storage = window.localStorage;
let secretWords = [];
let sorting = "similarity";  // chrono, alpha, similarity
let sort_forward = 1;
let darkModeMql = window.matchMedia('(prefers-color-scheme: dark)');
let darkMode = false;
let handleStats = false;  // not implemented


function init() {
    // set up UI
    document.querySelectorAll(".dialog-close").forEach((el) => {
        el.innerHTML = ""
        el.appendChild($("#x-icon").content.cloneNode(true));
    });

    if (!storage.getItem("readRules")) {
        openRules();
    }

    document.querySelectorAll(".dialog-underlay, .dialog-close, #capitalized-link").forEach((el) => {
        el.addEventListener('click', () => {
            document.body.classList.remove('dialog-open', 'rules-open', 'settings-open');
        });
    });

    document.querySelectorAll(".dialog").forEach((el) => {
        el.addEventListener("click", (event) => {
            // prevents click from propagating to the underlay, which closes the rules
            event.stopPropagation();
        });
    });

    // Dark mode
    const storagePrefersDarkColorScheme = storage.getItem("prefersDarkColorScheme");
    if (storagePrefersDarkColorScheme === 'true' || storagePrefersDarkColorScheme === 'false') {
        toggleDarkMode(storagePrefersDarkColorScheme === 'true');
    } else {
        toggleDarkMode(darkModeMql.matches);
        $("#dark-mode").checked = false;
        $("#dark-mode").indeterminate = true;
        darkModeMql.onchange = (e) => {
            toggleDarkMode(darkModeMql.matches);
        }
    }

    // show the warning
    document.body.classList.add('dialog-open', 'warning-open');
    $("#warning-close").focus();
}

// download the data
async function download() {
    await model.init((completed, total) => {
        $("#loading-progress").value = completed;
        $("#loading-progress").max = total;
    });
    const response = await fetch('data/secret_words.txt');
    const text = await response.text();
    secretWords = text.split('\n');
    $("#loading").innerHTML = "";
    startGame();
}


/////////////////////////////
// Game
/////////////////////////////

let gameOver = false;
let secret = "";
let guesses = {};
let latestGuess = null;
let similarityStory = null;

function startGame() {
    gameOver = false;
    secret = secretWords[Math.floor(Math.random() * secretWords.length)];
    window.secret = secret;  // for debugging
    guesses = {};
    latestGuess = null;
    similarityStory = model.getSimilarityStory(secret);
    $('#similarity-story').innerHTML =
        `The nearest word has a similarity of <b>${(similarityStory.top * 100).toFixed(2)}</b>,
        the tenth-nearest has a similarity of ${(similarityStory.top10 * 100).toFixed(2)}, and the
        one thousandth nearest word has a similarity of ${(similarityStory.rest * 100).toFixed(2)}.`;
    $('#response').innerHTML = "";
    $('#response').classList.remove('gaveup');
    $('#give-up-btn').style = "display:inline-block;";
    updateGuesses();
}

// $('#form').addEventListener('submit', async function(event) {
//     event.preventDefault();
//     if (secretVec === null) {
//         secretVec = (await getModel(secret)).vec;
//     }
//     $('#guess').focus();
//     $('#error').textContent = "";
//     let guess = $('#guess').value.trim().replace("!", "").replace("*", "");
//     if (!guess) {
//         return false;
//     }
//     if ($("#lower").checked) {
//         guess = guess.toLowerCase();
//     }

//     if (typeof unbritish !== 'undefined' && unbritish.hasOwnProperty(guess)) {
//         guess = unbritish[guess];
//     }

//     $('#guess').value = "";

//     const guessData = await getModel(guess);
//     if (!guessData) {
//         $('#error').textContent = `I don't know the word ${guess}.`;
//         return false;
//     }

//     let percentile = guessData.percentile;

//     const guessVec = guessData.vec;

//     cache[guess] = guessData;

//     let similarity = getCosSim(guessVec, secretVec) * 100.0;
//     if (!guessed.has(guess)) {
//         if (!gameOver) {
//             guessCount += 1;
//         }
//         guessed.add(guess);

//         const newEntry = [similarity, guess, percentile, guessCount];
//         guesses.push(newEntry);

//         if (handleStats) {
//             const stats = getStats();
//             if (!gameOver) {
//                 stats['totalGuesses'] += 1;
//             }
//             storage.setItem('stats', JSON.stringify(stats));
//         }
//     }
//     guesses.sort(function(a, b){return b[0]-a[0]});

//     if (!gameOver) {
//         saveGame(-1, -1);
//     }

//     chrono_forward = 1;

//     latestGuess = guess;
//     updateGuesses();

//     if (guess.toLowerCase() === secret && !gameOver) {
//         endGame(true, true);
//     }
//     return false;
// });

function makeGuess(guess) {
    $('#guess').value = "";
    $('#guess').focus();
    $('#error').textContent = "";

    guess = guess.toLowerCase();

    if (!(guess in guesses)) {
        const [similarity, percentile] = model.getSimilarity(secret, guess);
        if (similarity === null) {
            $('#error').textContent = `I don't know the word ${guess}.`;
            return false;
        }
        const newEntry = [similarity, guess, percentile, Object.keys(guesses).length + 1];
        guesses[guess] = newEntry;
    }

    latestGuess = guesses[guess];
    updateGuesses();

    if (guess === secret) {
        endGame(true, true);
    }
}

function endGame(won, countStats) {
    let stats;
    if (handleStats) {
        stats = getStats();
        if (countStats) {
            if (won) {
                if (onStreak) {
                    stats['winStreak'] += 1;
                } else {
                stats['winStreak'] = 1;
                }
                stats['wins'] += 1;
            } else {
                stats['winStreak'] = 0;
                stats['giveups'] += 1;
            }
            storage.setItem("stats", JSON.stringify(stats));
        }
    }

    $('#give-up-btn').style = "display:none;";
    $('#response').classList.add("gaveup");
    gameOver = true;
    const secretBase64 = btoa(unescape(encodeURIComponent(secret)));
    let response;
    if (won) {
        response = `<p><b>You found it in ${Object.keys(guesses).length}!  The secret word is ${secret}</b>.  Feel free to keep entering words if you are curious about the similarity to other words. Click the New game button to start a new game.</p>`
    } else {
        response = `<p><b>You gave up!  The secret word is: ${secret}</b>.  Feel free to keep entering words if you are curious about the similarity to other words. Click the New game button to start a new game.</p>`;
    }

    if (handleStats) {
        const totalGames = stats['wins'] + stats['giveups'] + stats['abandons'];
        response +=
            `<br/>
            Stats: <br/>
            <table>
                <tr> <th>First game:</th>                       <td>${stats['firstPlay']}</td>                              </tr>
                <tr> <th>Total days played:</th>                <td>${totalGames}</td>                                      </tr>
                <tr> <th>Wins:</th>                             <td>${stats['wins']}</td>                                   </tr>
                <tr> <th>Win streak:</th>                       <td>${stats['winStreak']}</td>                              </tr>
                <tr> <th>Give-ups:</th>                         <td>${stats['giveups']}</td>                                </tr>
                <tr> <th>Did not finish:</th>                   <td>${stats['abandons']}</td>                               </tr>
                <tr> <th>Total guesses across all games:</th>   <td>${stats['totalGuesses']}</td>                           </tr>
                <tr> <th>Average guesses across all games:</th> <td>${(stats['totalGuesses'] / totalGames).toFixed(2)}</td> </tr>
            </table>`;
    }
    $('#response').innerHTML = response;
}


/////////////////////////////
// Display
/////////////////////////////

function toggleDarkMode(on) {
    darkMode = on;
    document.body.classList[on ? 'add' : 'remove']('dark');
    $("#dark-mode").checked = on;
    updateGuesses();
}

function sortGuesses(a, b) {
    let diff;
    if (sorting === "similarity") {
        diff = -(a[0] - b[0]);  // most to least similar by default
    } else if (sorting === "chrono") {
        diff = a[3] - b[3];
    } else if (sorting === "alpha") {
        diff = a[2] - b[2];
    } else {
        console.log("Unknown sorting option: " + sorting);
    }
    return sort_forward * diff;
}

function updateGuesses() {
    let inner = `<tr><th id="chronoOrder">#</th><th id="alphaOrder">Guess</th><th id="similarityOrder">Similarity</th><th>Getting close?</th></tr>`;

    if (latestGuess !== null) {
        inner += guessRow(...latestGuess);
    }

    inner += "<tr><td colspan=4><hr></td></tr>";
    for (let entry of Object.values(guesses).sort(sortGuesses)) {
        if (entry !== latestGuess) {
            inner += guessRow(...entry);
        }
    }
    $('#guesses').innerHTML = inner;
    $('#chronoOrder').addEventListener('click', event => {
        if (sorting === "chrono") {
            sort_forward *= -1;
        } else {
            sort_forward = 1;
        }
        sorting = "chrono";
        updateGuesses();
    });
    $('#alphaOrder').addEventListener('click', event => {
        if (sorting === "alpha") {
            sort_forward *= -1;
        } else {
            sort_forward = 1;
        }
        sorting = "alpha";
        updateGuesses();
    });
    $('#similarityOrder').addEventListener('click', event => {
        if (sorting === "similarity") {
            sort_forward *= -1;
        } else {
            sort_forward = 1;
        }
        sorting = "similarity";
        updateGuesses();
    });
}

function guessRow(similarity, oldGuess, percentile, guessNumber, guess) {
    let percentileText = "(cold)";
    let progress = "";
    let cls = "";
    if (similarity >= similarityStory.rest * 100) {
        percentileText = '<span class="weirdWord">????<span class="tooltiptext">Unusual word found!  This word is not in the list of &quot;normal&quot; words that we use for the top-1000 list, but it is still similar! (Is it maybe capitalized?)</span></span>';
    }
    if (percentile) {
        if (percentile == 1000) {
            percentileText = "FOUND!";
        } else {
            cls = "close";
            percentileText = `<span class="percentile">${percentile}/1000</span>&nbsp;`;
            progress = ` <span class="progress-container">
<span class="progress-bar" style="width:${percentile/10}%">&nbsp;</span>
</span>`;
        }
    }
    let color;
    if (oldGuess === guess) {
        color = '#c0c';
    } else if (darkMode) {
        color = '#fafafa';
    } else {
        color = '#000';
    }
    const similarityLevel = similarity * 2.55;
    let similarityColor;
    if (darkMode) {
        similarityColor = `255,${255-similarityLevel},${255-similarityLevel}`;
    } else {
        similarityColor = `${similarityLevel},0,0`;
    }
    return `<tr><td>${guessNumber}</td><td style="color:${color}" onclick="select('${oldGuess}', secretVec);">${oldGuess}</td><td style="color: rgb(${similarityColor})">${similarity.toFixed(2)}</td><td class="${cls}">${percentileText}${progress}
</td></tr>`;

}

function getStats() {
    const oldStats = storage.getItem("stats");
    if (oldStats == null) {
        const stats = {
            'winStreak' : 0,
            'playStreak' : 0,
            'totalGuesses' : 0,
            'wins' : 0,
            'giveups' : 0,
            'abandons' : 0,
            'totalPlays' : 0,
        };
        storage.setItem("stats", JSON.stringify(stats));
        return stats;
    } else {
        const stats = JSON.parse(oldStats);
        stats['totalPlays'] += 1;
        return stats;
    }
}


/////////////////////////////
// Event handlers
/////////////////////////////

function closeWarning() {
    download();
    document.body.classList.remove('dialog-open', 'warning-open');
}

function openRules() {
    document.body.classList.add('dialog-open', 'rules-open');
    storage.setItem("readRules", true);
    $("#rules-close").focus();
}

function openSettings() {
    document.body.classList.add('dialog-open', 'settings-open');
    $("#settings-close").focus();
}

function setDarkModePreference(on) {
    storage.setItem("prefersDarkColorScheme", on);
    darkModeMql.onchange = null;
    toggleDarkMode(on);
}

function giveUp() {
    if (!gameOver) {
        if (confirm("Are you sure you want to give up?")) {
            endGame(false, true);
        }
    }
}


/////////////////////////////
// Other
/////////////////////////////

function $(q) {
    return document.querySelector(q);
}


window.addEventListener('load', init);
window.$ = $;
window.closeWarning = closeWarning;
window.makeGuess = makeGuess;
window.giveUp = giveUp;
window.startGame = startGame;
window.openRules = openRules;
window.openSettings = openSettings;
window.setDarkModePreference = setDarkModePreference;
