'use strict';

var pg     = require('../postgres/manager'),
    crypto = require('crypto'),
    bucket = process.env.AWS_BUCKET,
    AWS    = require('aws-sdk'),
    s3     = new AWS.S3(),
    async  = require('async'),
    fs     = require('fs');

function Note(){
}


Note.create = function(user, obj, images, cb){
  var awsLinks = {links: ['none']};
  obj.tags = obj.tags ? formatTags(obj.tags[0]) : 'default';

  //images array, post id
  if(images.file){
    awsLinks = reformatAwsFiles(images.file);
  }

  //save notes, tags, photos to the database!
  pg.query('select add_note($1, $2, $3, $4, $5)', [user.id, obj.title[0], obj.body[0], obj.tags, awsLinks.links], function(err, results){
    console.log(err);
    uploadFilesToS3(images.file, awsLinks, cb);
  });

};

Note.all = function(user, query, cb){
  pg.query('select * from display_notes($1, $2, $3, $4)', [user.id, query.limit, query.tagFilter, query.pageOffset], cb);
};

Note.findOne = function(noteId, cb){
  pg.query('select * from get_note($1)', [noteId], cb);
};

Note.addPhoto = function(image, noteId, cb){
  var buf = new Buffer(image, 'base64'),
  rdmFileName = crypto.randomBytes(32).toString('hex') + '.png', //random folder generated based on userame
  amzLink = 'https://s3.amazonaws.com/' + process.env.AWS_BUCKET + '/' + rdmFileName,
  params = {Bucket: bucket, Key: rdmFileName, Body: buf, ACL: 'public-read'};


  pg.query('insert into photos (link, note_id) values ($1, $2);', [amzLink, noteId], function(err, result){
    s3.putObject(params, function(err){
      console.log('S3 UPLOAD RESULT: ', err);
      cb(amzLink);
    });
  });
};

module.exports = Note;

//format tags for less inconsistencies
function formatTags(tags){
  tags = tags.split(',').map(function(s){ return s.trim(); }).join(',');
  return tags;
}

function reformatAwsFiles(images){
  var folder = crypto.randomBytes(48).toString('hex'), //random folder generated based on userame
  links = [];
  links = images.map(function(f){
    return 'https://s3.amazonaws.com/' + process.env.AWS_BUCKET + '/' + folder + '/' + f.originalFilename;
  });
  return {links: links, folder: folder};
}

function uploadFilesToS3(images, awsLinks, cb){
  if(!images){return cb();}
  var index = 0;
  async.forEach(images, function(file, callback){
    if((/^image/).test(file.headers['content-type'])){ //if it's an image, upload it
      fs.readFile(file.path, function(err, body){ //open the file with fs in order get the file to upload to s3
        var params = {Bucket: bucket, Key: awsLinks.folder + '/' + file.originalFilename, Body: body, ACL: 'public-read'};
        index++;
        s3.putObject(params, function(err){
          console.log('S3 UPLOAD RESULT: ', err);
          callback(null);
        });
      });
    }else { callback(null); } //if it wasn't an image, callback with nothing
  }, cb); //when done, callback to Note.create where it was called
}
