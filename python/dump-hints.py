# gensim monkeypatch
import collections.abc

collections.Mapping = collections.abc.Mapping

from functools import partial
import pickle

import sqlite3
import numpy as np

import heapq
import json

from numpy import dot
from numpy.linalg import norm

import tqdm.contrib.concurrent

from hashlib import sha1


def make_words():
    # The banned words are stored obfuscated because I do not want a giant
    # list of banned words to show up in my repository.
    banned_hashes = set()
    with open("banned.txt") as f:
        for line in f:
            banned_hashes.add(line.strip())

    words = []
    with open("../data/words.txt") as f:
        for line in f:
            word = line.strip()
            h = sha1()
            try:
                h.update(("banned" + word).encode("ascii"))
            except UnicodeEncodeError:
                # Definitely not banned
                print(word)
            hash = h.hexdigest()
            if not hash in banned_hashes:
                words.append(word)

    return words

# model vectors are prenormalized
def find_hints(secret, words, model):
    target_vec = model[secret]
    nearest = []
    for word in words:
        vec = model[word]
        similarity = dot(vec, target_vec)
        heapq.heappush(nearest, (similarity, word))
        if len(nearest) > 1000:
            heapq.heappop(nearest)
    nearest.sort()
    return nearest[:-1]


if __name__ == "__main__":
    # Load the dumped model with normalized vectors
    model = {}
    for letter_range in ("a-c", "d-h", "i-o", "p-r", "s-z"):
        with sqlite3.connect(f"../data/word2vec_{letter_range}.db") as con:
            cur = con.execute("SELECT * FROM word2vec")
            for word, vec in cur:
                vec = np.frombuffer(vec, dtype=np.float32)
                model[word] = vec / norm(vec)

    # List of words that can be hints (anything in the model, minus banned words)
    words = make_words()

    # Dump hints
    with open("../data/secret_words.txt") as f, sqlite3.connect("../data/hints.db") as hints_con, sqlite3.connect("../data/hint_similarities.db") as similarities_con:
        hint_columns = ", ".join(f"hint_{i} TEXT" for i in range(1, 1000))
        similarity_columns = ", ".join(f"similarity_{i} REAL" for i in range(1, 1000))
        hints_con.execute(f"CREATE TABLE IF NOT EXISTS hints (secret TEXT PRIMARY KEY, {hint_columns})")
        similarities_con.execute(f"CREATE TABLE IF NOT EXISTS similarities (secret TEXT PRIMARY KEY, {similarity_columns})")
        hints_con.execute("DELETE FROM hints")
        similarities_con.execute("DELETE FROM similarities")

        for line in tqdm.tqdm(f.readlines()):
            secret = line.strip()
            value_columns = ", ".join("?" * 999)
            hints = find_hints(secret, words, model)
            hints_con.execute(
                f"INSERT INTO hints VALUES ('{secret}', {value_columns})",
                [hint for similarity, hint in hints]
            )
            similarities_con.execute(
                f"INSERT INTO similarities VALUES ('{secret}', {value_columns})",
                [similarity for similarity, hint in hints]
            )
