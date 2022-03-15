# gensim monkeypatch
import collections.abc

collections.Mapping = collections.abc.Mapping

import word2vec
import numpy as np

import sqlite3
import tqdm


if __name__ == '__main__':
    model = word2vec.load("GoogleNews-vectors-negative300.bin", encoding="ISO-8859-1", new_lines=False)

    # 5 database files to get around github's file size limit
    con1 = sqlite3.connect("../data/word2vec_a-c.db")
    con2 = sqlite3.connect("../data/word2vec_d-h.db")
    con3 = sqlite3.connect("../data/word2vec_i-o.db")
    con4 = sqlite3.connect("../data/word2vec_p-r.db")
    con5 = sqlite3.connect("../data/word2vec_s-z.db")

    for con in (con1, con2, con3, con4, con5):
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

        if word[0] in "abc":
            con = con1
        elif word[0] in "defgh":
            con = con2
        elif word[0] in "ijklmno":
            con = con3
        elif word[0] in "pqr":
            con = con4
        else:  # stuvwxyz
            con = con5

        con.execute(
            "insert into word2vec values(?,?)",
            # Save float32 instead of float64 to save space
            # Nothing is lost since the model wasn't using the last few bytes anyway
            (word, model[word].astype(np.float32)),
        )
        file.write(word + "\n")

    for con in (con1, con2, con3, con4, con5):
        con.commit()
        con.close()
    file.close()
