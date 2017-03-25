'use strict';

var path = require('path');
var through = require('through2');
var convert = require('convert-source-map');
var normalize = require('normalize-path');

function comment(mapFn) {

  function transform(file, _, cb) {
    if (!file.sourceMap) {
      return cb(null, file);
    }

    // TODO: handle non-buffer

    function mapper(sourceMappingURL) {
      var result = sourceMappingURL;
      if (typeof mapFn === 'function') {
        result = mapFn(sourceMappingURL, file);
      }

      return normalize(result);
    }

    var contents = file.contents.toString()

    var hasInlineSourcemap = convert.commentRegex.test(contents);
    var hasExternalSourcemap = convert.mapFileCommentRegex.test(contents);

    if (!hasInlineSourcemap && !hasExternalSourcemap) {
      return cb(null, file);
    }

    var sourceMappingURL;

    if (hasInlineSourcemap) {
      // exec map?
      var result = mapper(sourceMappingURL);

      if (!result) {
        // TODO: buffer
        file.contents = convert.removeComments(contents);

        return cb(null, file);
      }

      if (result !== sourceMappingURL) {
        // TODO: buffer
        file.contents = contents.replace(convert.commentRegex, result);

        return cb(null, file);
      }

      return cb(null, file)
    }

    if (hasExternalSourcemap) {
      // exec map?
      var result = mapper(sourceMappingURL);

      if (!result) {
        // TODO: buffer
        file.contents = convert.removeMapFileComments(contents);

        return cb(null, file);
      }

      if (result !== sourceMappingURL) {
        // TODO: buffer
        file.contents = contents.replace(convert.mapFileCommentRegex, result);

        return cb(null, file);
      }
    }

    // TODO: unreachable?
    cb(null, file);
  }

  return through.obj(transform);
}

function prefix(str) {
  return comment(function(sourceMappingURL) {
    // TODO: url instead of path?
    return str + path.join('/', sourceMappingURL);
  })
}
comment.prefix = prefix;

function remove() {
  return comment(function() {
    return null;
  });
}
comment.remove = remove;

module.exports = comment;
