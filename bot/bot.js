var bot = require( '../slack' ).bot;
var database = require( '../database' );
var CronJob = require( 'cron' ).CronJob;

var switchPlayers = function ( players, configuration ) {
    var games = [];

    switch ( players ) {
        case 2:
            games = _.concat( games, configuration.twoplayersgames );
        case 3:
            games = _.concat( games, configuration.threeplayersgames );
        case 4:
            games = _.concat( games, configuration.fourplayersgames );
        case 5:
            games = _.concat( games, configuration.fiveplayersgames );
        case 6:
            games = _.concat( games, configuration.sixplayersgames );
        case 7:
            games = _.concat( games, configuration.sevenplayersgames );
    }

    return games;
};

new CronJob( '* * * * *', function () {
    database.getConfiguration( function ( err, configuration ) {
        bot.api.channels.list( {}, function ( err, response ) {

            var match = /(\d\d):(\d\d):(\d\d)/.exec( configuration.time );
            var hours = match[1];
            var minutes = match[2];

            var date = new Date();

            var channels = response.channels.filter( function ( channel ) {
                return channel.is_member && !channel.is_general;
            } );

            async.each( channels, function ( channel, callback ) {
                if ( date.getHours() == hours ) {
                    if ( date.getMinutes() == minutes ) {
                        var message = i18n.__( 'Howdy %s! Click :+1: to play, I will suggest a game in 15 minutes.', channel.name );

                        bot.api.chat.postMessage( {
                            channel: channel.id, text: message, as_user: 'true'
                        }, function ( err, messageResponse ) {
                            bot.api.reactions.add( {channel: channel.id, timestamp: messageResponse.ts, name: 'thumbsup'}, function ( err, reactionResponse ) {
                                database.createGame( messageResponse.ts, channel.id, function ( err, result ) {
                                    if ( err ) {
                                        console.error( err );
                                    }
                                    callback();
                                } );
                            } );
                        } );
                    } else if ( date.getMinutes() == (+minutes + +configuration.answerdelaymin) ) {
                        database.getLatestGame( channel.id, function ( err, game ) {
                            var message;

                            if ( game.players == 0 ) {
                                message = i18n.__( 'Time\'s up! Hello? Is there anybody in there?' ) + ' :spider_web:';
                            } else if ( game.players == 1 ) {
                                message = i18n.__( 'Time\'s up! Hmm, do you know solitaire?' ) + ' :spades::clubs::hearts::diamonds:';
                            } else if ( game.players > 7 ) {

                            } else {
                                var games = switchPlayers( game.players, configuration );

                                if ( _.isEmpty( games ) ) {
                                    message = i18n.__( 'Time\'s up! You should add games for %s players!', game.players );
                                } else {
                                    var randomGame = _.sample( games );

                                    console.log( randomGame );

                                    message = i18n.__( 'Time\'s up, you should play %s!', randomGame );
                                }
                            }

                            bot.api.chat.postMessage( {
                                channel: channel.id, text: message, as_user: 'true'
                            }, function ( err, response ) {
                                callback();
                            } );
                        } );
                    }
                }
            } );
        } )
    } );


}, null, true, 'America/Montreal' );

var botId;

bot.api.auth.test( {}, function ( err, response ) {
    botId = response.user_id;
} );

var updatePlayers = function ( event, fn ) {
    bot.api.channels.list( {}, function ( err, response ) {
        var channel = _.find( response.channels, ['id', event.item.channel] );

        if ( channel && event.item.type === 'message' && event.user !== botId ) {
            database.getLatestGame( channel.id, function ( err, game ) {
                if (event.item.ts === game.messageid ) {
                    var players = fn( game.players );
                    database.updateGame( game.id, players, function ( err, result ) { });
                }
            } );
        }
    } );
};

bot.botkit.on( 'reaction_added', function ( bot, event ) {
    updatePlayers( event, function ( players ) {
        if (event.reaction === "+1") { // this is silly, but yeah, it '+1' here and not thumbsup.
            return players + 1;
        } else {
            return players;
        }
    } )
} );

bot.botkit.on( 'reaction_removed', function ( bot, event ) {
    updatePlayers( event, function ( players ) {
        return players - 1;
    } )
} );
