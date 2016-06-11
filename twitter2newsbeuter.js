const async = require('async'),
      fs = require('fs'),
      path = require('path'),
      Twitter = require('twitter'),
      Feed = require('feed'),
      argv = require('yargs')
          .usage('Usage: $0 -n [feed name] -l [list name] -s [search string]')
          .default("s", [ ])
          .default("l", [ ])
          .demand([ "n" ])
          .alias("n", "name")
          .argv,
      _ = require('underscore');

const MAX_LIST_COUNT = 1000, // haven't checked if there is a limit to this
                             // but it definitely can return more than 100
                             // statuses
      MAX_SEARCH_COUNT = 100; // apparently anything more than 100 doesn't work anyway

const twitterClient = new Twitter(JSON.parse(fs.readFileSync(path.join(process.env.HOME, '.config', 'twitter2newsbeuter', 'twitter-config.json'), { 'encoding': 'utf8' })));

const getStatusesByListName = function (name, callback) {
    twitterClient.get("lists/list.json", { }, function(err, lists, response) {
        if (err) return callback(err);
        var list = lists.find(function (l) { return l.name.toLowerCase() === name.toLowerCase(); });
        if (!list) return callback(new Error("The specified list does not exist."));
        twitterClient.get("lists/statuses.json", { "list_id": list.id_str, "count": MAX_LIST_COUNT }, function(err, statuses, response) {
            callback(err, _.extend(list, { "statuses": statuses }));
        });
    });
}

const getStatusesBySearch = function (search, callback) {
    // Note the "result_type" setting below: the ambition is to avoid any
    // "intelligence" Twitter puts in selecting what to show me and what not
    twitterClient.get("search/tweets.json", { "q": search, "lang": "en", "result_type": "recent", "count": MAX_SEARCH_COUNT }, callback);
}

async.map([
    { "options": [ ].concat(argv.l), "function": getStatusesByListName },
    { "options": [ ].concat(argv.s), "function": getStatusesBySearch },
], function (config, callback) {
    async.map(config.options, config.function, function (err, results) {
        callback(err, err ? [ ] : _.flatten(_.pluck(results, "statuses"), true));
    });
}, function (err, tweets) {
    tweets = _.flatten(tweets, true);
    // makes the dates into Date objects
    tweets.forEach(function (s) { s.created_at = new Date(s.created_at); });
    // sort by created_at, descending
    tweets.sort(function (a, b) { return a.created_at < b.created_at; });
    // create the feed
    var feed = new Feed({
        id:          argv.name,
        title:       argv.name,
        link:        'https://github.com/Digital-Contraptions-Imaginarium/twitter2newsbeuter',
        updated:     Math.max(_.pluck(tweets, "created_at"))
    });
    tweets.forEach(function (tweet) {
        feed.addItem({
            id:             tweet.id_str,
            title:          "@" + tweet.user.screen_name + " - " + tweet.text,
            date:           tweet.created_at,
            link:           "https://twitter.com/" + tweet.user.screen_name + "/status/" + tweet.id_str,
            description:    tweet.text
        });
    });
    console.log(feed.render('atom-1.0'));
});
