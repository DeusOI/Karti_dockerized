const express = require('express');
const bodyParser = require('body-parser');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware to parse JSON data
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'public')));


let games = [];
// Load game data from file (if it exists)
const loadGameData = () => {
    const filePath = path.join(__dirname, 'games.json');

    // Check if the file exists and is not empty
    if (fs.existsSync(filePath)) {
        const rawData = fs.readFileSync(filePath, 'utf8');

        // If the file is empty, return an empty array
        if (rawData.trim() === '') {
            return [];
        }

        return JSON.parse(rawData);
    }

    return [];
};


// Save game data to file
const saveGameData = (games) => {
    const filePath = path.join(__dirname, 'games.json');
    fs.writeFileSync(filePath, JSON.stringify(games, null, 2));
};

// API to get all saved games
app.get('/api/games', (req, res) => {
    const games = loadGameData();
    res.json(games);
});

// API to save a new game
app.post('/api/games', (req, res) => {
    const newGame = req.body;
    const games = loadGameData();
    games.push(newGame);
    saveGameData(games);
    res.status(201).json({ message: 'Game saved successfully!' });
});
app.delete('/api/games/:id', (req, res) => {
    const gameId = parseInt(req.params.id);

    // Load the current game data from the file
    let games = loadGameData();

    // Filter out the game with the given ID
    games = games.filter(game => game.id !== gameId);

    // Save the updated game data back to the file
    saveGameData(games);

    // Respond with a success message
    res.status(200).json({ message: 'Game deleted successfully!' });
});


// Start the server
app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});
