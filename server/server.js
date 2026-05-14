const express = require('express');
const path = require('path');
const https = require('https');
const session = require('express-session');
const bcrypt = require('bcrypt');
const bodyParser = require('body-parser');
const movieModel = require('./movie-model.js');
const users = require('./user-model.js');
const config = require('./config.js');

const app = express();

function fetchJson(url) {
  return new Promise((resolve, reject) => {
    https.get(url, response => {
      let data = "";
      response.on("data", chunk => data += chunk);
      response.on("end", () => {
        try {
          const json = JSON.parse(data);
          resolve(json);
        } catch (error) {
          reject(error);
        }
      });
    }).on("error", reject);
  });
}

app.use(bodyParser.json());
app.use(session({
  secret: config.sessionSecret,
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    secure: false,
    maxAge: 24 * 60 * 60 * 1000,
  },
}));
app.use(express.static(path.join(__dirname, 'files')));

function requireLogin(req, res, next) {
  if (req.session && req.session.user) {
    next();
  } else {
    res.sendStatus(401);
  }
}

function ensureOmdbKey(res) {
  if (!config.omdbApiKey) {
    res.status(500).json({ message: 'OMDb API key is not configured. Please add OMDB_API_KEY to your .env file.' });
    return false;
  }
  return true;
}

app.post('/login', (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ message: 'Username and password are required.' });
  }

  const user = users[username];
  if (!user) {
    return res.status(401).json({ message: 'Invalid credentials.' });
  }

  bcrypt.compare(password, user.password)
    .then((match) => {
      if (!match) {
        return res.status(401).json({ message: 'Invalid credentials.' });
      }

      req.session.user = {
        username: user.username,
        firstName: user.firstName,
        lastName: user.lastName,
      };
      req.session.loginAt = new Date().toISOString();

      req.session.save((saveError) => {
        if (saveError) {
          console.error(saveError);
          return res.sendStatus(500);
        }
        res.json({ user: req.session.user, loginAt: req.session.loginAt });
      });
    })
    .catch((error) => {
      console.error(error);
      res.sendStatus(500);
    });
});

app.get('/session', (req, res) => {
  if (req.session && req.session.user) {
    res.json({ user: req.session.user, loginAt: req.session.loginAt || new Date().toISOString() });
  } else {
    res.sendStatus(401);
  }
});

app.get('/logout', (req, res) => {
  req.session.destroy((error) => {
    if (error) {
      console.error(error);
      return res.sendStatus(500);
    }
    res.clearCookie('connect.sid');
    res.sendStatus(200);
  });
});

app.get('/genres', requireLogin, (req, res) => {
  const genres = movieModel.getGenres(req.session.user.username).sort((a, b) => a.localeCompare(b));
  res.json(genres);
});

app.get('/movies', requireLogin, (req, res) => {
  const username = req.session.user.username;
  const movies = Object.values(movieModel.getUserMovies(username));
  const genre = req.query.genre;
  const filteredMovies = genre
    ? movies.filter((movie) => Array.isArray(movie.Genres) && movie.Genres.includes(genre))
    : movies;

  const promises = filteredMovies.map((movie) => {
    return fetchJson(`https://www.omdbapi.com/?i=${movie.imdbID}&apikey=${config.omdbApiKey}`)
      .then((data) => ({ ...movie, Poster: data.Poster || movie.Poster || 'N/A' }))
      .catch(() => ({ ...movie, Poster: movie.Poster || 'N/A' }));
  });

  Promise.all(promises)
    .then((moviesWithPosters) => {
      res.json(moviesWithPosters);
    })
    .catch((error) => {
      console.error(error);
      res.sendStatus(500);
    });
});

app.get('/movies/:imdbID', requireLogin, (req, res) => {
  const username = req.session.user.username;
  const movie = movieModel.getUserMovie(username, req.params.imdbID);

  if (!movie) {
    return res.sendStatus(404);
  }

  fetchJson(`https://www.omdbapi.com/?i=${req.params.imdbID}&apikey=${config.omdbApiKey}`)
    .then((data) => {
      const poster = data.Poster || movie.Poster || 'N/A';
      res.json({ ...movie, Poster: poster });
    })
    .catch(() => {
      res.json(movie);
    });
});

app.put('/movies/:imdbID', requireLogin, (req, res) => {
  const username = req.session.user.username;
  const imdbID = req.params.imdbID;
  const exists = movieModel.hasUserMovie(username, imdbID);

  movieModel.setUserMovie(username, imdbID, req.body);
  res.status(exists ? 200 : 201).json(req.body);
});

app.delete('/movies/:imdbID', requireLogin, (req, res) => {
  const username = req.session.user.username;
  const deleted = movieModel.deleteUserMovie(username, req.params.imdbID);

  if (deleted) {
    //bei OK hat er gemeckert, deswegen jetzt text im json Format
    res.status(200).json({ message: 'Movie deleted successfully.' });
  } else {
    res.status(404).json({ message: 'Movie not found.' });
  }
});

app.get('/search', requireLogin, (req, res) => {
  if (!ensureOmdbKey(res)) {
    return;
  }

  const query = req.query.q;
  if (!query) {
    return res.status(400).json({ message: 'Query parameter q is required.' });
  }

  fetchJson(`https://www.omdbapi.com/?s=${encodeURIComponent(query)}&apikey=${config.omdbApiKey}`)
    .then((data) => {
      if (data.Response === 'True' && Array.isArray(data.Search)) {
        res.json(data.Search);
      } else {
        const message = data.Error || 'No movies found.';
        res.status(500).json({ message });
      }
    })
    .catch((error) => {
      console.error(error);
      res.status(500).json({ message: 'OMDb search failed.' });
    });
});

app.post('/movies/:imdbID', requireLogin, (req, res) => {
  if (!ensureOmdbKey(res)) {
    return;
  }
  const username = req.session.user.username;
  const imdbID = req.params.imdbID;

  fetchJson(`https://www.omdbapi.com/?i=${imdbID}&plot=full&apikey=${config.omdbApiKey}`)
    .then((data) => {
      if (data.Response !== 'True') {
        return res.status(404).json({ message: 'Movie not found in OMDb.' });
      }

      const movie = {
        imdbID: data.imdbID,
        Title: data.Title || '',
        Released: data.Released || '',
        Runtime: Number.parseInt(data.Runtime, 10) || 0,
        Genres: data.Genre ? data.Genre.split(',').map((genre) => genre.trim()).filter(Boolean) : [],
        Directors: data.Director ? data.Director.split(',').map((item) => item.trim()).filter(Boolean) : [],
        Writers: data.Writer ? data.Writer.split(',').map((item) => item.trim()).filter(Boolean) : [],
        Actors: data.Actors ? data.Actors.split(',').map((item) => item.trim()).filter(Boolean) : [],
        Plot: data.Plot || '',
        Poster: data.Poster || '',
        Metascore: Number.parseInt(data.Metascore, 10) || 0,
        imdbRating: Number.parseFloat(data.imdbRating) || 0,
      };

      movieModel.setUserMovie(username, imdbID, movie);
      res.status(201).json(movie);
    })
    .catch((error) => {
      console.error(error);
      res.sendStatus(500);
    });
});

app.listen(config.port, () => {
  console.log(`Server now listening on http://localhost:${config.port}/`);
});


