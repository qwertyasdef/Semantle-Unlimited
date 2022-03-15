# gensim monkeypatch
import collections.abc

collections.Mapping = collections.abc.Mapping

import word2vec
import numpy as np

import sqlite3
import tqdm

from more_itertools import chunked


def bfloat(vec):
    """
    Half of each floating point vector happens to be zero in the Google model.
    Possibly using truncated float32 = bfloat. Discard to save space.
    """
    vec.dtype = np.int16
    return vec[1::2].tobytes()


if __name__ == '__main__':
    model = word2vec.load("GoogleNews-vectors-negative300.bin", encoding="ISO-8859-1", new_lines=False)

    # 3 database files to get around github's 100 Mb file limit
    con1 = sqlite3.connect("../data/word2vec_a-i.db")
    con2 = sqlite3.connect("../data/word2vec_j-r.db")
    con3 = sqlite3.connect("../data/word2vec_s-z.db")

    for con in (con1, con2, con3):
        con.execute("PRAGMA journal_mode=WAL")
        cur = con.cursor()
        cur.execute("""create table if not exists word2vec (word text PRIMARY KEY, vec blob)""")
        con.execute("DELETE FROM word2vec")
        con.commit()

    file = open("../data/words.txt", "w")

    # Write to database and words file
    for word in tqdm.tqdm(model.vocab):
        # many weird words contain #, _ for multi-word
        # some have e-mail addresses, start with numbers, :-), lots of === signs, ...
        if not word.isalpha() or not word.islower():
            continue

        if word[0] in "abcdefghi":
            con = con1
        elif word[0] in "jklmnopqr":
            con = con2
        else:  # stuvwxyz
            con = con3

        con.execute(
            "insert into word2vec values(?,?)",
            (word, bfloat(model[word])),
        )
        file.write(word + "\n")

    for con in (con1, con2, con3):
        con.commit()
        con.close()
    file.close()
