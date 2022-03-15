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


# many weird words contain #, _ for multi-word
# some have e-mail addresses, start with numbers, :-), lots of === signs, ...
def filter_vocab(vocab):
    return [word for word in vocab if word.isalpha() and word.islower()]


if __name__ == '__main__':
    model = word2vec.load("GoogleNews-vectors-negative300.bin", encoding="ISO-8859-1", new_lines=False)

    con = sqlite3.connect("../data/word2vec.db")
    file = open("../data/words.txt", "w")

    con.execute("PRAGMA journal_mode=WAL")
    cur = con.cursor()
    cur.execute("""create table if not exists word2vec (word text PRIMARY KEY, vec blob)""")
    con.commit()

    # import pdb;pdb.set_trace()

    CHUNK_SIZE = 1111
    con.execute("DELETE FROM word2vec")
    for words in chunked(tqdm.tqdm(filter_vocab(model.vocab)), CHUNK_SIZE):
        con.executemany(
            "insert into word2vec values(?,?)",
            ((word, bfloat(model[word])) for word in words),
        )
        file.writelines(word + "\n" for word in words)

    con.close()
    file.close()
