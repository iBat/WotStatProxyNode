module.exports = (function()
{
    // exports
    return {
        port: 1337,
        cacheTtl: 7 * 24 * 60 * 60 * 1000, // 7 days
        lastErrorTtl: 30 * 1000, // 30 sec
        dbName: "test",
        collectionName: "test_collection",
        statHost: "worldoftanks.ru",
        info: {
            xvm: {
                ver: "2.3",
                message: [
                    " * иконка игрока/клана в маркерах над танками",
                    " * добавлены топ 100 иконок для кланов",
                    " * добавлен редактор конфигов (пока без предварительного просмотра)",
                    " * исправлены ошибки и добавлены новые возможности"
                ].join("\n")
            }
        }
    }
})();
