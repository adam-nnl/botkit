/*~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
                                 __    ________.  ___.          ___.           __   
  ____   _____    ______  _  ___/  |__/ ____\_ |__\_ |__   _____\_ |__   _____/  |_ 
 /  _ \ /     \  / ___\ \/ \/ /\   __\   __\ | __ \| __ \ / ____/| __ \ /  _ \   __\
(  <_> )  Y Y  \/ /_/  >     /  |  |  |  |   | \_\ \ \_\ < <_|  || \_\ (  <_> )  |  
 \____/|__|_|  /\___  / \/\_/   |__|  |__|   |___  /___  /\__   ||___  /\____/|__|  
             \//_____/                           \/    \/    |__|    \/             

This is a Slack bot built with Botkit.

This bot demonstrates many of the core features of Botkit:

* Connect to Slack using the real time API
* Receive messages based on "spoken" patterns
* Reply to messages
* Use the conversation system to ask questions
* Use the built in storage system to store and retrieve information
  for a user.

And also cool shit like-
* Natural language processing(word2vec)
* Google Custom Search? Regular lmgtfy for now
* ROCK PAPER SCISSORS!

# RUN THE BOT:
  Run your bot from the command line:
    token=<MY TOKEN> node bbqbot.js
    
  Run your bot using pm2:
    npm install pm2 -g
    token=<MY TOKEN> pm2 start bbqbot.js

# USE THE BOT:
  Find your bot inside Slack to send it a direct message.

  Say: "Hello"
  The bot will reply "Hello!"

  Say: "who are you?"
  The bot will tell you its name, where it is running, and for how long.

  Say: "Call me <nickname>"
  Tell the bot your nickname. Now you are friends.

  Say: "who am I?"
  The bot will tell you your nickname, if it knows one for you.

  Say: "rpc @username"
  will kick off a rousing game of Rock, Paper, Scissors
  
  Say: "@botname google <search_terms>" or "@botname search <search_terms>" or DM bot "search/google <serach_terms>"
  runs quick google search and replies with URL link

  Make sure to invite your bot into other channels using /invite @<my bot>!
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~*/


if (!process.env.token) {
    console.log('Error: Specify token in environment');
    process.exit(1);
}

var Botkit = require('./lib/Botkit.js');
var os = require('os');

var w2v = require( 'word2vec' );

var controller = Botkit.slackbot({
    debug: true
});

var bot = controller.spawn({
    token: process.env.token
}).startRTM();

controller.hears(['word2vec'],'direct_message', function(bot, message) {

    w2v.loadModel( './GoogleNews-vectors-negative300.bin', function( error, model ) {
    console.log( model );
    bot.reply(message,model);
    });

        //bot.reply(message,':robot_face: I am a bot named <@');

    });

controller.hears(['google (.*)', 'search (.*)'], 'direct_message,direct_mention,mention', function(bot, message) {
    var query = message.match[1];
    var search_str = require('querystring').escape(query);
        bot.reply(message,':mag: Let me Google that for you!- ' + 'https://www.google.com/?#q=' + search_str );
});

const { hears, storage: { channels } } = controller;

function privateConvo(bot, message) {
  const { user, channel } = message;

  return (err, convo) => {
    if (err) throw err;

    convo.ask('Do you want to play `paper`, `rock`, or `scissors`?', [
      {
        pattern: 'paper|rock|scissors',
        callback(response, convo) {
          // since no further messages are queued after this,
          // the conversation will end naturally with status === 'completed'
          convo.next();
        },
      }, {
        default: true,
        callback(response, convo) {
          convo.repeat();
          convo.next();
        },
      },
    ], { key: 'rockPaperScissors' }); // store the results in a field called rockPaperScissors

    convo.on('end', (convo) => {
      if (convo.status === 'completed') {
        const prc = convo.extractResponse('rockPaperScissors');

        channels.get(channel, (err, data) => {
          if (err) throw err;

          const updateData = data;
          updateData.players[user].played = prc;

          const { players } = updateData;
          const playerIDs = Object.keys(players);

          // check if only one player has played
          const onlyOnePlayed = playerIDs.find((id) => players[id].played === '');

          if (onlyOnePlayed) {
            channels.save(updateData, (err) => {
              if (err) throw err;

              bot.reply(message, `<@${user}> has played!`);
            });
          } else {
            const gameResults = playerIDs.map((id) => `<@${id}> played ${players[id].played}`);

            bot.reply(message, gameResults.join(' & '));

            // reset the game data
            channels.save({ id: updateData.id }, (err) => {
              if (err) throw err;
            });
          }
        });
      } else {
        // this happens if the conversation ended prematurely for some reason
        bot.reply(message, 'OK, nevermind!');
      }
    });
  };
}

hears(['rps'], 'direct_message,direct_mention,mention', (bot, message) => {
  const { user, channel, text } = message;
  const userData = text.match(/<@([A-Z0-9]{9})>/);

  if (userData) {
    const playerTwo = userData[1];
    const gameData = {
      id: channel,
      players: {
        [user]: {
          accepted: true,
          played: '',
        },
        [playerTwo]: {
          accepted: false,
          played: '',
        },
      },
    };

    channels.save(gameData, (err) => {
      if (err) throw err;

      bot.say({
        text: `<@${playerTwo}> you've been challenged to a game of ROCK PAPER SCISSORS by <@${user}>,  say \`accept\` unless you're too scared.`,
        channel,
      });

      bot.startPrivateConversation(message, privateConvo(bot, message));
    });
  } else {
    bot.reply(message, 'You didn\'t challenge anyone...');
  }
});

hears(['accept'], 'ambient', (bot, message) => {
  const { channel } = message;

  channels.get(channel, (err, data) => {
    if (err) throw err;

    if (data && 'players' in data) {
      const { user } = message;
      const { players } = data;

      if (user in players && !players[user].accepted) {
        bot.reply(message, 'GREAT, LET THE BATTLE BEGIN!!!');

        bot.startPrivateConversation(message, privateConvo(bot, message));
      } else {
        const player = Object.keys(players).find((p) => !players[p].accepted);

        bot.reply(message, `Not you <@${user}>, waiting for <@${player}>.`);
      }
    }
  });
});

controller.hears(['hello', 'hi'], 'direct_message,direct_mention,mention', function(bot, message) {

    bot.api.reactions.add({
        timestamp: message.ts,
        channel: message.channel,
        name: 'robot_face',
    }, function(err, res) {
        if (err) {
            bot.botkit.log('Failed to add emoji reaction :(', err);
        }
    });


    controller.storage.users.get(message.user, function(err, user) {
        if (user && user.name) {
            bot.reply(message, 'Hello ' + user.name + '!!');
        } else {
            bot.reply(message, 'Hello.');
        }
    });
});

controller.hears(['call me (.*)', 'my name is (.*)'], 'direct_message,direct_mention,mention', function(bot, message) {
    var name = message.match[1];
    controller.storage.users.get(message.user, function(err, user) {
        if (!user) {
            user = {
                id: message.user,
            };
        }
        user.name = name;
        controller.storage.users.save(user, function(err, id) {
            bot.reply(message, 'Got it. I will call you ' + user.name + ' from now on.');
        });
    });
});

controller.hears(['what is my name', 'who am i'], 'direct_message,direct_mention,mention', function(bot, message) {

    controller.storage.users.get(message.user, function(err, user) {
        if (user && user.name) {
            bot.reply(message, 'Your name is ' + user.name);
        } else {
            bot.startConversation(message, function(err, convo) {
                if (!err) {
                    convo.say('I do not know your name yet!');
                    convo.ask('What should I call you?', function(response, convo) {
                        convo.ask('You want me to call you `' + response.text + '`?', [
                            {
                                pattern: 'yes',
                                callback: function(response, convo) {
                                    // since no further messages are queued after this,
                                    // the conversation will end naturally with status == 'completed'
                                    convo.next();
                                }
                            },
                            {
                                pattern: 'no',
                                callback: function(response, convo) {
                                    // stop the conversation. this will cause it to end with status == 'stopped'
                                    convo.stop();
                                }
                            },
                            {
                                default: true,
                                callback: function(response, convo) {
                                    convo.repeat();
                                    convo.next();
                                }
                            }
                        ]);

                        convo.next();

                    }, {'key': 'nickname'}); // store the results in a field called nickname

                    convo.on('end', function(convo) {
                        if (convo.status == 'completed') {
                            bot.reply(message, 'OK! I will update my dossier...');

                            controller.storage.users.get(message.user, function(err, user) {
                                if (!user) {
                                    user = {
                                        id: message.user,
                                    };
                                }
                                user.name = convo.extractResponse('nickname');
                                controller.storage.users.save(user, function(err, id) {
                                    bot.reply(message, 'Got it. I will call you ' + user.name + ' from now on.');
                                });
                            });



                        } else {
                            // this happens if the conversation ended prematurely for some reason
                            bot.reply(message, 'OK, nevermind!');
                        }
                    });
                }
            });
        }
    });
});


controller.hears(['uptime', 'identify yourself', 'who are you', 'what is your name'],
    'direct_message,direct_mention,mention', function(bot, message) {

        var hostname = os.hostname();
        var uptime = formatUptime(process.uptime());

        bot.reply(message,
            ':robot_face: I am a bot named <@' + bot.identity.name +
             '>. I have been running for ' + uptime + ' on ' + hostname + '.');

    });

function formatUptime(uptime) {
    var unit = 'second';
    if (uptime > 60) {
        uptime = uptime / 60;
        unit = 'minute';
    }
    if (uptime > 60) {
        uptime = uptime / 60;
        unit = 'hour';
    }
    if (uptime != 1) {
        unit = unit + 's';
    }

    uptime = uptime + ' ' + unit;
    return uptime;
}
