const HIDDEN_USER_IDS = ['0000-0000']; // Hidden admin user

function filterVisibleUsers(users) {
    if (!Array.isArray(users)) return [];
    return users.filter(user => !HIDDEN_USER_IDS.includes(user.formatted_id));
}

function isUserHidden(userId) {
    return HIDDEN_USER_IDS.includes(userId);
}

module.exports = {
    filterVisibleUsers,
    isUserHidden,
    HIDDEN_USER_IDS
}; 