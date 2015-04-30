#!/usr/bin/env node

var fs = require('fs');
var mkdirp = require('mkdirp');
var path = require('path');
var log = require('verbalize');
var _ = require('lodash');
var path = require('path');
var ncp = require('ncp').ncp;
var sqlite3 = require('sqlite3').verbose();
var Crawler = require("crawler");
var argv = require('minimist')(process.argv.slice(2));

/**
 * Everything in the file should be customized
 */


    // Verbalize `runner`
log.runner = 'open-ui5-docs';

// Use `-n` or `--name` to specify the text to append
var name = argv._[0] || argv.n || argv.name;

// Use `-n` or `--name` to specify the text to append
var jsdocs = argv._[1] || argv.d || argv.jsdocs;
jsdocs += 'docs/api';

var version = argv._[2] || argv.v || argv.version;

var docsetPath = path.resolve() + '/' + name + '.docset/';
var targetDocumentationDirectory = docsetPath + 'Contents/Resources/Documents/';

/**
 * populates database with data from docset
 */
function populateDatabase() {
    // create sqlite database
    var sqliteFile = docsetPath + 'Contents/Resources/docSet.dsidx';
    var database = new sqlite3.Database(sqliteFile);

    database.serialize(function () {
        // create tables
        database.run("CREATE TABLE searchIndex(id INTEGER PRIMARY KEY, name TEXT, type TEXT, path TEXT)");
        database.run("CREATE UNIQUE INDEX anchor ON searchIndex (name, type, path)");
        var stmt = database.prepare("INSERT OR IGNORE INTO searchIndex(name, type, path) VALUES (?, ?, ?)");

        // get all files in to index
        function parseFile(filePath, file) {
            console.log('parse file "' + filePath + file);

            var relativeFileName = path.relative(targetDocumentationDirectory, filePath);

            fs.readFile(filePath, function (err, data) {
                // crawl each file and insert its contents to index
                var crawler = new Crawler({
                    "maxConnections": 10,

                    // This will be called for each crawled page
                    "callback": function (error, result, $) {

                        var className = file.substring(0, file.length - 5);
                        if (error == null) {
                            // insert class to index
                            $('h1.classTitle').each(function (index, title) {
                                var type = $(title).text().split(' ')[0].trim();
                                switch (type) {
                                    case 'Index':
                                        type = 'Guide';
                                        break;
                                    case 'final':
                                    case 'abstract':
                                        type = 'Class'
                                        break;
                                }
                                stmt.run(className, type, relativeFileName);
                                console.log('add ' + type + ' to db index: ' + className);
                            });

                            // $ is a jQuery instance scoped to the server-side DOM of the page
                            // add all events to index
                            $('[href*=event]:not([href^=#])').each(function (index, event) {
                                var eventName = $(event).text();
                                stmt.run(className + ':' + eventName, 'Event', className + '');
                                console.log('add Event to db index: ' + eventName);
                            });

                            $('.classMethod b a:not([href^=#])').each(function (index, section) {
                                stmt.run(className + ':' + $(section).text(), 'Method', $(section).attr('href').replace('../', ''));
                                console.log('add Method to db index: ' + $(section).text());
                            });
                        }
                    }
                });

                crawler.queue([
                    {
                        'html': data
                    }
                ]);
            });
        }

        var crawlDir = function (dir) {
            console.log('crawl direcotry "' + dir + '"');
            fs.readdir(dir, function (err, files) {
                if (files) {
                    files.forEach(function (file) {
                        var filePath = dir + '/' + file;
                        fs.lstat(filePath, function (err, stats) {
                            if (stats && stats.isFile()) {
                                if (file.indexOf('.html') !== -1)
                                    parseFile(filePath, file);
                            }
                            else {
                                crawlDir(filePath);
                            }
                        });
                    });
                }
            });
        };

        crawlDir(targetDocumentationDirectory);

        // when everything is parsed... write to db
        process.on('exit', function (code) {
            console.log('write to db');
            stmt.finalize();

            database.close();
        });
    });
}
/**
 * Application
 */

//fs.rmdirSync(targetDocumentationDirectory);

    // create filesystem for dash docset
mkdirp(targetDocumentationDirectory, function () {
    console.log('Docset scaffold created!')
    // copy all jsdoc files to dashdocset
    ncp(jsdocs, targetDocumentationDirectory, function (err) {
        if (err) {
            return console.error(err);
        }
        console.log('Documentation copied!');

        populateDatabase();

        // create info.plist file
        fs.readFile(__dirname + '/../templates/Info.plist', 'utf-8', function (err, data) {
            var infoPlistTemplated = _.template(data, {
                'bundleName': name
            });
            fs.writeFileSync(docsetPath + 'Contents/Info.plist', infoPlistTemplated);
        });

        fs.readFile(__dirname + '/../templates/index.html', 'utf-8', function (err, data) {
            var indexTemplated = _.template(data, {
                'version': version
            });
            fs.writeFileSync(docsetPath + 'Contents/Resources/Documents/index.html', indexTemplated);
        });

        fs.createReadStream(__dirname + '/../templates/icon.png').pipe(fs.createWriteStream(docsetPath + 'icon.png'));
        fs.createReadStream(__dirname + '/../templates/icon@2x.png').pipe(fs.createWriteStream(docsetPath + 'icon@2x.png'));
        fs.createReadStream(__dirname + '/../templates/icotxt_white_220x72_blue_open.png').pipe(fs.createWriteStream(docsetPath + 'Contents/Resources/Documents/icotxt_white_220x72_blue_open.png'));
    });
});