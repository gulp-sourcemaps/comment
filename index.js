'use strict';

var path = require('path');
var through = require('through2');
var convert = require('convert-source-map');
var normalize = require('normalize-path');

function processInline(contents, mapper) {
  var sourceMappingURL = convert.getCommentValue(contents);

  var result = mapper(sourceMappingURL);

  if (!result) {
    return convert.removeComments(contents);
  }

  if (result !== sourceMappingURL) {
    // TODO: use the same comment type as original
    // TODO: we don't want to parse/convert so this works but should be named different
    result = convert.generateMapFileComment(result);
    // TODO: add `replaceComments` to convert-source-map
    return contents.replace(convert.commentRegex, result);
  }
}

function processExternal(contents, mapper) {
  var sourceMappingURL = convert.getMapFileCommentValue(contents);

  var result = mapper(sourceMappingURL);

  if (!result) {
    return convert.removeMapFileComments(contents);
  }

  if (result !== sourceMappingURL) {
    // TODO: use the same comment type as original
    result = convert.generateMapFileComment(result);
    // TODO: add `replaceMapFileComments` to convert-source-map
    return contents.replace(convert.mapFileCommentRegex, result);
  }
}

function comment(mapFn) {

  function transform(file, _, cb) {
    // TODO: should this error? Probably not
    if (!file.isBuffer()) {
      return cb(null, file);
    }

    var contents = file.contents.toString();

    var hasInlineSourcemap = convert.commentRegex.test(contents);
    var hasExternalSourcemap = convert.mapFileCommentRegex.test(contents);

    if (!hasInlineSourcemap && !hasExternalSourcemap) {
      return cb(null, file);
    }

    function mapper(sourceMappingURL) {
      var result = sourceMappingURL;
      if (typeof mapFn === 'function') {
        result = mapFn(sourceMappingURL, file);
      }

      // This is inverted because hasExternalSourcemap covers inline also
      if (hasInlineSourcemap || !result) {
        return result;
      }

      return normalize(result);
    }

    // Always one of the 2 because we bail if neither
    var processor = hasInlineSourcemap ? processInline : processExternal;

    var result = processor(contents, mapper);

    if (result) {
      file.contents = new Buffer(result);
    }

    return cb(null, file);
  }

  return through.obj(transform);
}

function prefix(str) {
  // TODO: should this somehow check if it is a path vs data-uri?
  return comment(function(sourceMappingURL) {
    // TODO: url instead of path?
    return str + path.join('/', sourceMappingURL);
  });
}
comment.prefix = prefix;

function remove() {
  return comment(function() {
    // Returning anything falsey removes the comment
    return null;
  });
}
comment.remove = remove;

module.exports = comment;
