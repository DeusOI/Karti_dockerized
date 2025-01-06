const points = [6, 4, 2, 1]; // Points for 1st, 2nd, 3rd, and 4th
document.addEventListener('DOMContentLoaded', function () {
    updateGameTable();
    updateLeaderboard();
});

// Event listener for form submission
document.getElementById('game-form').addEventListener('submit', function (e) {
    e.preventDefault();

    const gameDate = document.getElementById('game-date').value;
    const players = Array.from(document.querySelectorAll('.player'));

    // Get sorted players based on current DOM order
    const sortedPlayers = players.map(player => player.querySelector('.player-name').textContent);

    // Assign points to players based on position
    const gameData = {
        id: Date.now(), // Use timestamp as a unique ID
        gameDate,
        players: sortedPlayers.map((player, index) => ({
            name: player,
            points: points[index]
        }))
    };


    saveGameData(gameData);
    updateGameTable();
    updateLeaderboard();
});

// Save game data to API or database
function saveGameData(gameData) {
    fetch('/api/games', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(gameData)
    })
        .then(response => response.json())
        .then(data => {
            console.log('Game saved:', data);
        })
        .catch((error) => {
            console.error('Error:', error);
        });
}

// Update game table with results
// Update game table with results
function updateGameTable() {
    fetch('/api/games')
        .then(response => response.json())
        .then(games => {
            // Sort games by gameDate or id in descending order (newest first)
            games.sort((a, b) => new Date(b.id) - new Date(a.id)); // Sorting by date or ID

            // Limit to the 10 most recent games
            const recentGames = games.slice(0, 10);

            const tableBody = document.getElementById('games-table').querySelector('tbody');
            tableBody.innerHTML = ''; // Clear previous entries

            recentGames.forEach(game => {
                const row = document.createElement('tr');
                row.innerHTML = `
                   
                    <td>${game.gameDate}</td>
                    <td>${game.players[0].name}: ${game.players[0].points}</td>
                    <td>${game.players[1].name}: ${game.players[1].points}</td>
                    <td>${game.players[2].name}: ${game.players[2].points}</td>
                    <td>${game.players[3].name}: ${game.players[3].points}</td>
                     <td>
                        <button class="delete-game" data-id="${game.id}">X</button>
                    </td>
                `;
                tableBody.appendChild(row);
            });

            // Add event listener for delete buttons
            const deleteButtons = document.querySelectorAll('.delete-game');
            deleteButtons.forEach(button => {
                button.addEventListener('click', deleteGame);
            });
        })
        .catch(error => {
            console.error('Error fetching game data:', error);
        });
}

function exportTableAsImage(tableId, filename) {
    const tableElement = document.getElementById(tableId);

    html2canvas(tableElement, {
        scrollY: -window.scrollY, // Adjust for scrolling
        scale: 2 // Higher scale for better quality
    }).then(canvas => {
        // Create an image from the canvas
        const link = document.createElement('a');
        link.download = `${filename}.png`;
        link.href = canvas.toDataURL('image/png');
        link.click();
    }).catch(error => {
        console.error('Error exporting table:', error);
    });
}



document.getElementById('export-leaderboard-table').addEventListener('click', () => {
    exportTableAsImage('leaderboard-table', 'Табела_со_резултати');
});

function deleteGame(event) {
    const gameId = parseInt(event.target.getAttribute('data-id'), 10);

    // Show a confirmation popup
    const confirmDelete = confirm("Are you sure you want to delete this game?");
    if (!confirmDelete) {
        return; // Exit if the user clicks "No"
    }

    fetch(`/api/games/${gameId}`, {
        method: 'DELETE',
    })
        .then(response => {
            if (!response.ok) {
                throw new Error('Failed to delete game');
            }
            // Refresh the game table and leaderboard
            updateGameTable();
            updateLeaderboard();
        })
        .catch(error => {
            console.error('Error deleting game:', error);
        });
}


// Update leaderboard with total points
// Update leaderboard with total points
function updateLeaderboard() {
    fetch('/api/games')
        .then(response => response.json())
        .then(games => {
            // Create an object to store total points for each player
            const playerPoints = {
                'Елена': 0,
                'Панче': 0,
                'Грозданка': 0,
                'Васил': 0
            };

            // Calculate total points for each player
            games.forEach(game => {
                game.players.forEach(player => {
                    playerPoints[player.name] += player.points;
                });
            });

            // Sort players by total points
            const sortedPlayers = Object.keys(playerPoints).sort((a, b) => playerPoints[b] - playerPoints[a]);

            // Update the leaderboard table
            const leaderboardBody = document.getElementById('leaderboard-table').querySelector('tbody');
            leaderboardBody.innerHTML = '';

            sortedPlayers.forEach((playerName, index) => {
                const position = index + 1;
                const row = document.createElement('tr');
                row.innerHTML = `
                    <td>${position}</td>
                    <td>${playerName}</td>
                    <td>${playerPoints[playerName]}</td>
                `;
                leaderboardBody.appendChild(row);
            });
        })
        .catch(error => {
            console.error('Error fetching game data for leaderboard:', error);
        });
}

// Drag-and-drop functionality to swap players
const players = document.querySelectorAll('.player');
let draggedPlayer = null;
let touchStartX, touchStartY;

// Helper function to find the draggable card
function getDraggableElement(target) {
    return target.closest('.player'); // Ensure only the card element is draggable
}

// Handle drag and touch events
players.forEach(player => {
    // Desktop drag events
    player.setAttribute('draggable', true);
    player.addEventListener('dragstart', (e) => {
        draggedPlayer = getDraggableElement(e.target);
        e.dataTransfer.effectAllowed = 'move';
    });
    player.addEventListener('dragover', dragOver);
    player.addEventListener('drop', (e) => {
        e.preventDefault();
        const targetPlayer = getDraggableElement(e.target);
        swapPlayers(targetPlayer);
    });
    player.addEventListener('dragend', () => {
        draggedPlayer = null;
    });

    // Mobile touch events
    player.addEventListener('touchstart', (e) => {
        const target = getDraggableElement(e.target);
        if (!target) return;
        draggedPlayer = target;
        touchStartX = e.touches[0].clientX;
        touchStartY = e.touches[0].clientY;
    });
    player.addEventListener('touchmove', (e) => {
        if (!draggedPlayer) return;
        e.preventDefault(); // Prevent scrolling
        const touch = e.touches[0];
        draggedPlayer.style.transform = `translate(${touch.clientX - touchStartX}px, ${touch.clientY - touchStartY}px)`;
    });
    player.addEventListener('touchend', (e) => {
        if (!draggedPlayer) return;
        draggedPlayer.style.transform = ''; // Reset position
        const targetPlayer = document.elementFromPoint(e.changedTouches[0].clientX, e.changedTouches[0].clientY)?.closest('.player');
        swapPlayers(targetPlayer);
        draggedPlayer = null;
    });
});

function dragOver(e) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
}

function swapPlayers(targetPlayer) {
    if (targetPlayer && targetPlayer !== draggedPlayer) {
        const draggedContent = draggedPlayer.innerHTML;
        draggedPlayer.innerHTML = targetPlayer.innerHTML;
        targetPlayer.innerHTML = draggedContent;
    }
}
