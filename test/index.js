'use strict';

var fs = require('fs');
var path = require('path');

var expect = require('expect');

var miss = require('mississippi');
var File = require('vinyl');
var normalize = require('normalize-path');
var convert = require('convert-source-map');

var comment = require('../');

var pipe = miss.pipe;
var from = miss.from;
var concat = miss.concat;

// TODO: use buffer directly?
var sourceContent = fs.readFileSync(path.join(__dirname, 'fixtures/helloworld.js'), 'utf8');
var mappedContent = fs.readFileSync(path.join(__dirname, 'fixtures/helloworld.map.js'), 'utf8');
var inlineMap = convert.getCommentValue(mappedContent);

function makeFile() {
  var file = new File({
    cwd: __dirname,
    base: __dirname + '/assets',
    path: __dirname + '/assets/helloworld.js',
    contents: new Buffer(''),
  });

  file.sourceMap = {
    version: 3,
    file: 'helloworld.js',
    names: [],
    mappings: '',
    sources: ['helloworld.js'],
  };

  return file;
}

function makeExternalMapFile() {
  var file = makeFile();
  file.contents = new Buffer(sourceContent + '\n//# sourceMappingURL=helloworld.js.map');
  return file;
}

function makeInlineMapFile() {
  var file = makeFile();
  file.contents = new Buffer(mappedContent);
  return file;
}

describe('comment', function() {

  // TODO: is this proper behavior?
  it('ignores file if no comment', function(done) {
    var file = makeFile();

    var spy = expect.createSpy();

    function assert(files) {
      expect(files.length).toEqual(1);
      expect(spy).toNotHaveBeenCalled();
    }

    pipe([
      from.obj([file]),
      comment(spy),
      concat(assert),
    ], done);
  });

  it('ignores file if not Buffer contents', function(done) {
    var file = makeFile();
    file.contents = null;

    var spy = expect.createSpy();

    function assert(files) {
      expect(files.length).toEqual(1);
      expect(spy).toNotHaveBeenCalled();
    }

    pipe([
      from.obj([file]),
      comment(spy),
      concat(assert),
    ], done);
  });

  it('only ignores a file without sourceMappingURL comment', function(done) {
    var file = makeExternalMapFile();
    var file2 = makeFile();

    function mapFn(sourceMappingURL) {
      return sourceMappingURL;
    }

    var spy = expect.createSpy().andCall(mapFn);

    function assert(files) {
      expect(files.length).toEqual(2);
      expect(spy.calls.length).toEqual(1);
    }

    pipe([
      from.obj([file, file2]),
      comment(spy),
      concat(assert),
    ], done);
  });

  it('ignores a file with invalid sourceMappingURL comment', function(done) {
    var file = makeFile();
    file.contents = new Buffer(sourceContent + '\n//# sourceMappingURL=');

    var spy = expect.createSpy();

    function assert(files) {
      expect(files.length).toEqual(1);
      expect(spy).toNotHaveBeenCalled();
    }

    pipe([
      from.obj([file]),
      comment(spy),
      concat(assert),
    ], done);
  });

  describe('with external sourceMappingURL', function() {

    it('does not care about the file.sourceMap property', function(done) {
      var file = makeExternalMapFile();
      delete file.sourceMap;

      function mapFn(sourceMappingURL) {
        return sourceMappingURL;
      }

      var spy = expect.createSpy().andCall(mapFn);

      function assert(files) {
        expect(files.length).toEqual(1);
        expect(spy).toHaveBeenCalled();
      }

      pipe([
        from.obj([file]),
        comment(spy),
        concat(assert),
      ], done);
    });

    it('calls map function per file', function(done) {
      var file = makeExternalMapFile();

      function mapFn(sourceMappingURL) {
        return '/test/' + sourceMappingURL;
      }

      function assert(files) {
        expect(files.length).toEqual(1);
        var comment = convert.getMapFileCommentValue(files[0].contents.toString());
        expect(comment).toEqual('/test/helloworld.js.map');
      }

      pipe([
        from.obj([file]),
        comment(mapFn),
        concat(assert),
      ], done);
    });

    it('normalizes Windows paths to unix paths', function(done) {
      var file = makeExternalMapFile();

      function mapFn(sourceMappingURL) {
        return '\\test\\' + sourceMappingURL;
      }

      function assert(files) {
        expect(files.length).toEqual(1);
        var comment = convert.getMapFileCommentValue(files[0].contents.toString());
        expect(comment).toEqual('/test/helloworld.js.map');
      }

      pipe([
        from.obj([file]),
        comment(mapFn),
        concat(assert),
      ], done);
    });

    it('does not need a map function', function(done) {
      var file = makeExternalMapFile();

      function assert(files) {
        expect(files.length).toEqual(1);
        var comment = convert.getMapFileCommentValue(files[0].contents.toString());
        expect(comment).toEqual('helloworld.js.map');
      }

      pipe([
        from.obj([file]),
        comment(),
        concat(assert),
      ], done);
    });

    it('ignores non-function argument', function(done) {
      var file = makeExternalMapFile();

      function assert(files) {
        expect(files.length).toEqual(1);
        var comment = convert.getMapFileCommentValue(files[0].contents.toString());
        expect(comment).toEqual('helloworld.js.map');
      }

      pipe([
        from.obj([file]),
        comment('invalid argument'),
        concat(assert),
      ], done);
    });

    it('still normalizes without a map function', function(done) {
      var file = makeFile();
      file.contents = new Buffer(sourceContent + '\n//# sourceMappingURL=\\test\\helloworld.js.map');

      function assert(files) {
        expect(files.length).toEqual(1);
        var comment = convert.getMapFileCommentValue(files[0].contents.toString());
        expect(comment).toEqual('/test/helloworld.js.map');
      }

      pipe([
        from.obj([file]),
        comment(),
        concat(assert),
      ], done);
    });

    it('calls map function with the sourceMappingURL value and the vinyl file', function(done) {
      var file = makeExternalMapFile();

      function mapFn(sourceMappingURL, file) {
        expect(File.isVinyl(file)).toEqual(true);

        return file.base + '/' + sourceMappingURL;
      }

      function assert(files) {
        expect(files.length).toEqual(1);

        var file = files[0];
        var base = normalize(file.base);
        var comment = convert.getMapFileCommentValue(file.contents.toString());
        expect(comment).toEqual(base + '/helloworld.js.map');
      }

      pipe([
        from.obj([file]),
        comment(mapFn),
        concat(assert),
      ], done);
    });

    it('removes the comment if null is returned from the map function', function(done) {
      var file = makeExternalMapFile();

      function mapFn() {
        return null;
      }

      function assert(files) {
        expect(files.length).toEqual(1);
        var comment = convert.getMapFileCommentValue(files[0].contents.toString());
        expect(comment).toEqual(null);
      }

      pipe([
        from.obj([file]),
        comment(mapFn),
        concat(assert),
      ], done);
    });

    it('removes the comment if undefined is returned from the map function', function(done) {
      var file = makeExternalMapFile();

      function mapFn() {
        return undefined;
      }

      function assert(files) {
        expect(files.length).toEqual(1);
        var comment = convert.getMapFileCommentValue(files[0].contents.toString());
        expect(comment).toEqual(null);
      }

      pipe([
        from.obj([file]),
        comment(mapFn),
        concat(assert),
      ], done);
    });

    it('removes the comment if false is returned from the map function', function(done) {
      var file = makeExternalMapFile();

      function mapFn() {
        return false;
      }

      function assert(files) {
        expect(files.length).toEqual(1);
        var comment = convert.getMapFileCommentValue(files[0].contents.toString());
        expect(comment).toEqual(null);
      }

      pipe([
        from.obj([file]),
        comment(mapFn),
        concat(assert),
      ], done);
    });

    it('removes the comment if an empty string is returned from the map function', function(done) {
      var file = makeExternalMapFile();

      function mapFn() {
        return '';
      }

      function assert(files) {
        expect(files.length).toEqual(1);
        var comment = convert.getMapFileCommentValue(files[0].contents.toString());
        expect(comment).toEqual(null);
      }

      pipe([
        from.obj([file]),
        comment(mapFn),
        concat(assert),
      ], done);
    });

    it('changes the buffer reference when values are different', function(done) {
      var file = makeExternalMapFile();
      var contents = file.contents;

      function mapFn(sourceMappingURL) {
        return '/test/' + sourceMappingURL;
      }

      function assert(files) {
        expect(files.length).toEqual(1);
        expect(files[0].contents).toNotBe(contents);
      }

      pipe([
        from.obj([file]),
        comment(mapFn),
        concat(assert),
      ], done);
    });

    it('keeps the buffer reference when values are same', function(done) {
      var file = makeExternalMapFile();
      var contents = file.contents;

      function mapFn(sourceMappingURL) {
        return sourceMappingURL;
      }

      function assert(files) {
        expect(files.length).toEqual(1);
        expect(files[0].contents).toBe(contents);
      }

      pipe([
        from.obj([file]),
        comment(mapFn),
        concat(assert),
      ], done);
    });
  });

  describe('with inline sourceMappingURL', function() {

    it('does not care about the file.sourceMap property', function(done) {
      var file = makeInlineMapFile();
      delete file.sourceMap;

      function mapFn(sourceMappingURL) {
        return sourceMappingURL;
      }

      var spy = expect.createSpy().andCall(mapFn);

      function assert(files) {
        expect(files.length).toEqual(1);
        expect(spy).toHaveBeenCalled();
      }

      pipe([
        from.obj([file]),
        comment(spy),
        concat(assert),
      ], done);
    });

    it('calls map function per file', function(done) {
      var file = makeInlineMapFile();

      function mapFn(sourceMappingURL) {
        return sourceMappingURL.replace('utf8', 'utf-8');
      }

      function assert(files) {
        expect(files.length).toEqual(1);
        var comment = convert.getCommentValue(files[0].contents.toString());
        expect(comment).toContain('utf-8');
      }

      pipe([
        from.obj([file]),
        comment(mapFn),
        concat(assert),
      ], done);
    });

    it('does not normalize mapped sourceMappingURLs', function(done) {
      var file = makeInlineMapFile();

      function mapFn(sourceMappingURL) {
        // Don't do this at home; things WILL break
        return sourceMappingURL + '\\';
      }

      function assert(files) {
        expect(files.length).toEqual(1);
        var comment = convert.getCommentValue(files[0].contents.toString());
        expect(comment).toContain('\\');
      }

      pipe([
        from.obj([file]),
        comment(mapFn),
        concat(assert),
      ], done);
    });

    it('does not need a map function', function(done) {
      var file = makeInlineMapFile();

      function assert(files) {
        expect(files.length).toEqual(1);
        var comment = convert.getCommentValue(files[0].contents.toString());
        expect(comment).toEqual(inlineMap);
      }

      pipe([
        from.obj([file]),
        comment(),
        concat(assert),
      ], done);
    });

    it('ignores non-function argument', function(done) {
      var file = makeInlineMapFile();

      function assert(files) {
        expect(files.length).toEqual(1);
        var comment = convert.getCommentValue(files[0].contents.toString());
        expect(comment).toEqual(inlineMap);
      }

      pipe([
        from.obj([file]),
        comment('invalid argument'),
        concat(assert),
      ], done);
    });

    it('does not normalize without a map function', function(done) {
      var file = makeFile();
      // Don't do this at home; things WILL break
      file.contents = new Buffer(sourceContent + '\n//# sourceMappingURL=' + inlineMap + '\\');

      function assert(files) {
        expect(files.length).toEqual(1);
        var comment = convert.getCommentValue(files[0].contents.toString());
        expect(comment).toContain('\\');
      }

      pipe([
        from.obj([file]),
        comment(),
        concat(assert),
      ], done);
    });

    it('calls map function with the sourceMappingURL value and the vinyl file', function(done) {
      var file = makeInlineMapFile();

      function mapFn(sourceMappingURL, file) {
        expect(File.isVinyl(file)).toEqual(true);

        return sourceMappingURL.replace('utf8', 'utf-8');
      }

      function assert(files) {
        expect(files.length).toEqual(1);
        var comment = convert.getCommentValue(files[0].contents.toString());
        expect(comment).toContain('utf-8');
      }

      pipe([
        from.obj([file]),
        comment(mapFn),
        concat(assert),
      ], done);
    });

    it('removes the comment if null is returned from the map function', function(done) {
      var file = makeInlineMapFile();

      function mapFn() {
        return null;
      }

      function assert(files) {
        expect(files.length).toEqual(1);
        var comment = convert.getCommentValue(files[0].contents.toString());
        expect(comment).toEqual(null);
      }

      pipe([
        from.obj([file]),
        comment(mapFn),
        concat(assert),
      ], done);
    });

    it('removes the comment if undefined is returned from the map function', function(done) {
      var file = makeInlineMapFile();

      function mapFn() {
        return undefined;
      }

      function assert(files) {
        expect(files.length).toEqual(1);
        var comment = convert.getCommentValue(files[0].contents.toString());
        expect(comment).toEqual(null);
      }

      pipe([
        from.obj([file]),
        comment(mapFn),
        concat(assert),
      ], done);
    });

    it('removes the comment if false is returned from the map function', function(done) {
      var file = makeInlineMapFile();

      function mapFn() {
        return false;
      }

      function assert(files) {
        expect(files.length).toEqual(1);
        var comment = convert.getCommentValue(files[0].contents.toString());
        expect(comment).toEqual(null);
      }

      pipe([
        from.obj([file]),
        comment(mapFn),
        concat(assert),
      ], done);
    });

    it('removes the comment if an empty string is returned from the map function', function(done) {
      var file = makeInlineMapFile();

      function mapFn() {
        return '';
      }

      function assert(files) {
        expect(files.length).toEqual(1);
        var comment = convert.getCommentValue(files[0].contents.toString());
        expect(comment).toEqual(null);
      }

      pipe([
        from.obj([file]),
        comment(mapFn),
        concat(assert),
      ], done);
    });

    it('changes the buffer reference when values are different', function(done) {
      var file = makeInlineMapFile();
      var contents = file.contents;

      function mapFn(sourceMappingURL) {
        return sourceMappingURL.replace('utf8', 'utf-8');
      }

      function assert(files) {
        expect(files.length).toEqual(1);
        expect(files[0].contents).toNotBe(contents);
      }

      pipe([
        from.obj([file]),
        comment(mapFn),
        concat(assert),
      ], done);
    });

    it('keeps the buffer reference when values are same', function(done) {
      var file = makeInlineMapFile();
      var contents = file.contents;

      function mapFn(sourceMappingURL) {
        return sourceMappingURL;
      }

      function assert(files) {
        expect(files.length).toEqual(1);
        expect(files[0].contents).toBe(contents);
      }

      pipe([
        from.obj([file]),
        comment(mapFn),
        concat(assert),
      ], done);
    });
  });
});

describe('comment.prefix', function() {

  it('prefixes the sourceMappingURL with the string provided', function(done) {
    var file = makeExternalMapFile();

    function assert(files) {
      expect(files.length).toEqual(1);
      var comment = convert.getMapFileCommentValue(files[0].contents.toString());
      expect(comment).toEqual('/test/helloworld.js.map');
    }

    pipe([
      from.obj([file]),
      comment.prefix('/test'),
      concat(assert),
    ], done);
  });
});

describe('comment.remove', function() {

  it('removes an external sourcemap comment', function(done) {
    var file = makeExternalMapFile();

    function assert(files) {
      expect(files.length).toEqual(1);
      var comment = convert.getMapFileCommentValue(files[0].contents.toString());
      expect(comment).toEqual(null);
    }

    pipe([
      from.obj([file]),
      comment.remove(),
      concat(assert),
    ], done);
  });

  it('removes an inline sourcemap comment', function(done) {
    var file = makeInlineMapFile();

    function assert(files) {
      expect(files.length).toEqual(1);
      var comment = convert.getCommentValue(files[0].contents.toString());
      expect(comment).toEqual(null);
    }

    pipe([
      from.obj([file]),
      comment.remove(),
      concat(assert),
    ], done);
  });
});
