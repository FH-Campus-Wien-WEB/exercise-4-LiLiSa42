let currentSession = null;
let activeGenre = null;

const loginButton = document.getElementById('loginButton');
const logoutButton = document.getElementById('logoutButton');
const openSearchButton = document.getElementById('openSearchButton');
const loginDialog = document.getElementById('loginDialog');
const loginForm = document.getElementById('loginForm');
const loginError = document.getElementById('loginError');
const cancelLogin = document.getElementById('cancelLogin');
const searchDialog = document.getElementById('searchDialog');
const searchForm = document.getElementById('searchForm');
const cancelSearch = document.getElementById('cancelSearch');
const searchResults = document.getElementById('searchResults');
const userGreeting = document.getElementById('userGreeting');
const mainElement = document.querySelector('main');
const navList = document.querySelector('nav>ul');


//gibt Login-Zeitpunkt retour
function formatGermanDateTime(isoString) {
  const date = new Date(isoString);
  const dateString = new Intl.DateTimeFormat('de-DE', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(date);
  const timeString = new Intl.DateTimeFormat('de-DE', {
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
  return `${dateString} um ${timeString}`;
}

function updateUI() {
  const loggedIn = !!currentSession;
  userGreeting.textContent = loggedIn
    ? `Hi ${currentSession.user.firstName} ${currentSession.user.lastName}, du hast dich am ${formatGermanDateTime(currentSession.loginAt)} angemeldet.`
    : 'Bitte melde dich an, um deine Sammlung zu sehen.';

  loginButton.hidden = loggedIn;
  logoutButton.hidden = !loggedIn;
  openSearchButton.hidden = !loggedIn;
}

 //das credentials same origin braucht man, dass man sich nicht jedes Mal neu anmelden muss, wenn man eine geschützte Ressource anfragt. 
 //Es sorgt dafür, dass Cookies (und damit die Session-ID) automatisch mitgeschickt werden, wenn die Anfrage an die gleiche Origin geht wie die Seite selbst. 
 // Ohne diese Einstellung würde der Server die Anfragen als nicht authentifiziert betrachten, da die Session-ID nicht übermittelt wird, und könnte daher 401 Unauthorized Fehler zurückgeben.
async function fetchJson(url, options) {
  const response = await fetch(url, {
    credentials: 'include',
    ...options,
  });

  if (!response.ok) {
    const errorBody = await response.json().catch(() => ({}));
    throw new Error(errorBody.message || `HTTP ${response.status}`);
  }
  return response.json();
}

async function checkSession() {
  try {
    currentSession = await fetchJson('/session');
  } catch (error) {
    currentSession = null;
  }
  updateUI();
  if (currentSession) {
    await loadGenres();
    await loadMovies();
  }
}

function clearMain() {
  mainElement.innerHTML = '';
}

function createMovieCard(movie) {
  const article = document.createElement('article');
  article.id = movie.imdbID;

  const image = document.createElement('img');
  image.src = movie.Poster || '';
  image.alt = movie.Title;
  article.appendChild(image);

  const title = document.createElement('h1');
  title.textContent = movie.Title;
  article.appendChild(title);

  const actionRow = document.createElement('p');
  const editButton = document.createElement('button');
  editButton.type = 'button';
  editButton.textContent = 'Edit';
  editButton.addEventListener('click', () => {
    location.href = `edit.html?imdbID=${movie.imdbID}`;
  });
  actionRow.appendChild(editButton);

  if (currentSession) {
    const deleteButton = document.createElement('button');
    deleteButton.type = 'button';
    deleteButton.textContent = 'Delete';
    deleteButton.addEventListener('click', () => deleteMovie(movie.imdbID));
    actionRow.appendChild(deleteButton);
  }

  article.appendChild(actionRow);

  const details = document.createElement('p');
  const runtime = Number.isFinite(movie.Runtime) ? `${Math.trunc(movie.Runtime / 60)}h ${movie.Runtime % 60}m` : movie.Runtime;
  details.textContent = `Runtime ${runtime} • Released on ${new Date(movie.Released).toLocaleDateString('de-DE')}`;
  article.appendChild(details);

  const genreRow = document.createElement('p');
  genreRow.classList.add('genre');
  genreRow.textContent = Array.isArray(movie.Genres) ? movie.Genres.join(', ') : movie.Genres;
  article.appendChild(genreRow);

  article.appendChild(Object.assign(document.createElement('p'), { textContent: movie.Plot }));
  article.appendChild(Object.assign(document.createElement('p'), { textContent: `Metascore: ${movie.Metascore} | IMDb Rating: ${movie.imdbRating}` }));
  article.appendChild(Object.assign(document.createElement('h2'), { textContent: 'Director' + (movie.Directors && movie.Directors.length > 1 ? 's' : '') }));
  const directorList = document.createElement('ul');
  (movie.Directors || []).forEach((director) => {
    const item = document.createElement('li');
    item.textContent = director;
    directorList.appendChild(item);
  });
  article.appendChild(directorList);

  article.appendChild(Object.assign(document.createElement('h2'), { textContent: 'Writer' + (movie.Writers && movie.Writers.length > 1 ? 's' : '') }));
  const writerList = document.createElement('ul');
  (movie.Writers || []).forEach((writer) => {
    const item = document.createElement('li');
    item.textContent = writer;
    writerList.appendChild(item);
  });
  article.appendChild(writerList);

  article.appendChild(Object.assign(document.createElement('h2'), { textContent: 'Actor' + (movie.Actors && movie.Actors.length > 1 ? 's' : '') }));
  const actorList = document.createElement('ul');
  (movie.Actors || []).forEach((actor) => {
    const item = document.createElement('li');
    item.textContent = actor;
    actorList.appendChild(item);
  });
  article.appendChild(actorList);

  return article;
}

async function loadGenres() {
  try {
    const genres = await fetchJson('/genres');
    navList.innerHTML = '';

    const allItem = document.createElement('li');
    const allButton = document.createElement('button');
    allButton.type = 'button';
    allButton.textContent = 'All';
    allButton.addEventListener('click', () => {
      activeGenre = null;
      loadMovies();
    });
    allItem.appendChild(allButton);
    navList.appendChild(allItem);

    genres.forEach((genre) => {
      const listItem = document.createElement('li');
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = genre;
      button.addEventListener('click', () => {
        activeGenre = genre;
        loadMovies(genre);
      });
      listItem.appendChild(button);
      navList.appendChild(listItem);
    });
  } catch (error) {
    navList.innerHTML = '<li>Fehler beim Laden der Genres.</li>';
  }
}

async function loadMovies(genre) {
  if (!currentSession) {
    clearMain();
    mainElement.append('Bitte melde dich an, um Filme anzuzeigen.');
    return;
  }

  try {
    const url = new URL('/movies', window.location.origin);
    if (genre) {
      url.searchParams.set('genre', genre);
    }
    const movies = await fetchJson(url.href);
    clearMain();
    if (movies.length === 0) {
      mainElement.append('Keine Filme gefunden.');
      return;
    }
    movies.forEach((movie) => mainElement.appendChild(createMovieCard(movie)));
  } catch (error) {
    clearMain();
    mainElement.append(`Daten konnten nicht geladen werden: ${error.message}`);
  }
}

async function deleteMovie(imdbID) {
  try {
    await fetchJson(`${window.location.origin}/movies/${imdbID}`, { method: 'DELETE' });
    loadMovies(activeGenre);
  } catch (error) {
    alert(`Löschen fehlgeschlagen: ${error.message}`);
  }
}

function openDialog(dialog) {
  if (typeof dialog.showModal === 'function') {
    dialog.showModal();
  } else {
    dialog.setAttribute('open', '');
  }
}

function closeDialog(dialog) {
  if (typeof dialog.close === 'function') {
    dialog.close();
  } else {
    dialog.removeAttribute('open');
  }
}

loginButton.addEventListener('click', () => openDialog(loginDialog));
logoutButton.addEventListener('click', async () => {
  try {
    await fetch('/logout', { credentials: 'include' });
  } finally {
    currentSession = null;
    updateUI();
  }
});
openSearchButton.addEventListener('click', () => {
  searchResults.innerHTML = '';
  searchForm.query.value = '';
  openDialog(searchDialog);
});

cancelLogin.addEventListener('click', () => {
  loginError.textContent = '';
  closeDialog(loginDialog);
});

cancelSearch.addEventListener('click', () => closeDialog(searchDialog));

loginForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  loginError.textContent = '';

  const username = loginForm.username.value.trim();
  const password = loginForm.password.value;

  try {
    currentSession = await fetchJson('/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });

    closeDialog(loginDialog);
    loginForm.reset();
    updateUI();
    await loadGenres();
    await loadMovies();
  } catch (error) {
    loginError.textContent = error.message || 'Login fehlgeschlagen.';
  }
});

searchForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  searchResults.innerHTML = '';
  const query = searchForm.query.value.trim();

  if (!query) {
    searchResults.textContent = 'Bitte einen Suchbegriff eingeben.';
    return;
  }

  try {
    const movies = await fetchJson(`${window.location.origin}/search?q=${encodeURIComponent(query)}`);
    if (!Array.isArray(movies) || movies.length === 0) {
      searchResults.textContent = 'Keine Filme gefunden.';
      return;
    }

    movies.forEach((movie) => {
      const item = document.createElement('article');
      const heading = document.createElement('h3');
      heading.textContent = `${movie.Title} (${movie.Year})`;
      item.appendChild(heading);

      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = 'Add';
      button.addEventListener('click', async () => {
        try {
          await fetchJson(`${window.location.origin}/movies/${movie.imdbID}`, { method: 'POST' });
          item.remove();
          await loadGenres();
          await loadMovies(activeGenre);
        } catch (error) {
          alert(`Hinzufügen fehlgeschlagen: ${error.message}`);
        }
      });
      item.appendChild(button);
      searchResults.appendChild(item);
    });
  } catch (error) {
    searchResults.textContent = `Suchfehler: ${error.message}`;
  }
});

window.addEventListener('load', () => {
  checkSession();
});
