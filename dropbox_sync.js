var Dropbox = require('dropbox');
var prompt = require('prompt');
var fs = require('fs');
var mongo = require('mongodb').MongoClient;
var Binary = require('mongodb').Binary;

// specify the port in which mongodb is running (by default it's 27017)
const MONGO_PORT = 27017
// Change to your generated access token
var token = 'Your-token';

// Function to get the file extension from a filename
function getFileExtension(filename){
  return (/[.]/.exec(filename)) ? (/[^.]+$/.exec(filename))[0] : undefined;
}


function process(callback){
  var dbx = new Dropbox({ accessToken: token });
  //get all files in dropbox account under /docs folder
  dbx.filesListFolder({ path: '/docs' })
    .then(function (response) {

      // Parse the files and check if valid ( size < 8MB and correct file extension )
      response.entries.forEach(function(entry){
        if(
            entry['.tag'] != 'file' || 
            entry['size'] > 8*1024*1024 || 
            ['pdf','doc','docx','ppt','pptx','jpeg','jpg','png'].indexOf(getFileExtension(entry['name'])) < 0
          ){
            // If not valid skip to the next one
            console.log('Entry skipped');
            return;
        }

        // Create a sharing link for current file
        dbx.sharingCreateSharedLink({path : entry.path_display, short_url:false})
          .then(function(res){
            // get the file from the obtained link
            dbx.sharingGetSharedLinkFile({ url: res.url })
              .then(function(data){
                // mongo must be up and running on port 27017
                mongo.connect('mongodb://localhost:'+MONGO_PORT+'/sync', function(err,db){
                  if(err) console.log(err);
                  var collection = db.collection('files');
                  collection.find({name:data.name}).toArray(function(err,rec){
                    //console.log(rec);
                    // rec contains the files with the same name as the current entry
                    if(rec.length == 0){
                      collection.insert({name:data.name, data:data.fileBinary}, {w:1}, function(err, records){
                        console.log("Record added as "+records['ops'][0]._id);
                        console.log('insertion of "'+data.name+'" finished');
                      });
                    } else {
                      console.log('file '+data.name+' found in database');
                    }
                  });
                });



              })
              .catch(function (err) {
                throw err;
              });
          })
          .catch(function (err) {
            throw err;
          });
      });
    })
    .catch(function (err) {
      console.log(err);
    });
    // call the callback once again to restart the service
    callback();
}

// wait for 10 seconds
function wait(){
  setTimeout(function(){
    process(wait);
  }, 10000);
}

// make the service called from bin/www and auto-updating every 10 seconds
module.exports = {
  start : function() {
    process(wait);
  }
}