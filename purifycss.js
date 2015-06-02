var fs = require('fs');
var gonzales = require('gonzales');
var util = require('util');
var _ = require('underscore');
var CleanCss = require('clean-css');

var htmlEls = ['a','abbr','acronym','address','applet','area','article','aside','audio','b','base','basefont','bdi','bdo','bgsound','big','blink','blockquote','body','br','button','canvas','caption','center','cite','code','col','colgroup','command','content','data','datalist','dd','del','details','dfn','dialog','dir','div','dl','dt','element','em','embed','fieldset','figcaption','figure','font','footer','form','frame','frameset','head','header','hgroup','hr','html','i','iframe','image','img','input','ins','isindex','kbd','keygen','label','legend','li','link','listing','main','map','mark','marquee','menu','menuitem','meta','meter','multicol','nav','nobr','noembed','noframes','noscript','object','ol','optgroup','option','output','p','param','picture','plaintext','pre','progress','q','rp','rt','rtc','ruby','s','samp','script','section','select','shadow','small','source','spacer','span','strike','strong','style','sub','summary','sup','table','tbody','td','template','textarea','tfoot','th','thead','time','title','tr','track','tt','u','ul','var','video','wbr','xmp'];

//////////////////////////////////////////////
// The main function is the "purify" function.
// Everything else is a helper
//////////////////////////////////////////////

var concatFiles = function(files){
  return files.reduce(function(total, file){
    return total + fs.readFileSync(file, 'utf8');
  }, '');
};

var getAllIndexes = function(content, str){
  var indices = [];

  for(var i = 0; i < content.length - str.length + 1; i++){
    if(content.substr(i, str.length) === str){
      indices.push(i);
    }
  }

  if(indices.length === 0){
    indices = false;
  }

  return indices;
};

var neighborsAreLetters = function(content, indices, str){
  if (!indices){
    return false;
  }

  return _.every(indices, function(i){
    return !!content[i - 1].match(/[a-z]/i) ||
           !!content[i + str.length].match(/[a-z]/i);
  });
};

var formatCSS = function(styles){
  styles = styles.split('\\n\\n').join('');
  styles = styles.split(' \\n').join('');
  styles = styles.split('   ').join('');
  styles = styles.split('}').join('}\\n');
  styles = styles.split('}\\n\\n').join('}\\n');
  styles = styles.split(' }').join('}');
  styles = styles.split(' }').join('}');

  return styles;
};

var extractHTMLElementsFromContent = function(content){
  return _.filter(htmlEls, function(ele){
    var indices = getAllIndexes(content, ele);
    var neighborsAreNotLetters = !neighborsAreLetters(content, indices, ele);

    return indices && neighborsAreNotLetters;
  });
};

var extractClassesFromFlatCSS = function(json){
  var classes = [];

  for(var i = 0; i < json.length; i++){
    if(json[i] === 'clazz'){
      classes.push(json[i + 2]);
    }
  }

  return _.uniq(classes);
};

var extractIDsFromFlatCSS = function(json){
  var ids = [];

  for(var i = 0; i < json.length; i++){
    if(json[i] === 'shash'){
      ids.push(json[i + 1]);
    }
  }

  return _.uniq(ids);
};

var findClassesInFiles = function(classes, content){
  return _.filter(classes, function(className){

    // we search for the prefix, middles, and suffixes
    // because if the prefix/middle/suffix can't be found, then
    // certainly the whole className can't be found.
    return contentHasPrefixSuffix(className.toLowerCase(), content);
  });
};

var contentHasPrefixSuffix = function(className, content){
  var split = className.split('-');

  if(split.length === 1){
    return content.indexOf(split[0]) > -1;
    var indices = getAllIndexes(content, split[0]);
    var neighborsAreNotLetters = !neighborsAreLetters(content, indices, split[0]);
    var found = !!indices;

    return found && neighborsAreLetters;
  }

  var foundParts = _.every(split, function(part){
    var indices = getAllIndexes(content, part);
    var neighborsAreNotLetters = !neighborsAreLetters(content, indices, part);
    var found = !!indices;

    return found && neighborsAreNotLetters;
  });

  if(!foundParts){
    return false;
  }

  var i = 0;
  var foundOneWithHyphen = _.some(split, function(part){
    if(i === 0){
      part = part + '-';
    }

    if(i < split.length - 1){
      part = '-' + part + '-';
    }

    if(i === split.length - 1){
      part = '-' + part;
    }

    i++;
    return content.indexOf(part) > -1;
  });

  return foundParts && foundOneWithHyphen;
};

var filterByUsedClassesAndHtmlEls = function(ast, classes, htmlEls){
  return _.filter(ast, function(branch){
    var flatBranch = _.flatten(branch.slice());
    if(flatBranch[0] === 's'){
      return true;
    }

    for(var i = 0; i < flatBranch.length; i++){
      if(flatBranch[i] === 'clazz'){
        return classes.indexOf(flatBranch[i + 2]) > -1;
      }
    }

    for(var i = 0; i < flatBranch.length; i++){
      if(flatBranch[i] === 'ident' && htmlEls.indexOf(flatBranch[i + 1]) > -1){
        return true;
      }
    }

    return false;
  });
};

var filterByUsedIds = function(ast, ids){
  return _.filter(ast, function(branch){
    var flatBranch = _.flatten(branch.slice());

    if(flatBranch[0] === 's'){
      return true;
    }

    for(var i = 0; i < flatBranch.length; i++){
      if(flatBranch[i] === 'shash'){
        return ids.indexOf(flatBranch[i + 1]) > -1;
      }
    }

    return false;
  });
};

var removeUnusedMedias = function(atSign, classes){
  atSign.forEach(function(branch){
    if(branch[0] !== 'atruler'){
      return;
    }

    if(_.flatten(branch).indexOf('media') === -1){
      return;
    }
    for(var i = 1; i < branch.length; i++){
      if(branch[i][0] !== 'atrulers'){
        continue;
      }

      branch[i] = _.filter(branch[i], function(twig){
        if(twig[0] !== 'ruleset'){
          return true;
        }
        var flattened = _.flatten(twig);
        var flag = false;

        for(var j = 0; j < flattened.length; j++){
          if(flattened[j] === 'clazz'){
            if(classes.indexOf(flattened[j + 2]) > -1){
              flag = true;
            } else {
              return false;
            }
          }
        }

        return flag;
      });
    }
  });
};

var filterMediasByZeroClasses = function(atSign){
  return _.filter(atSign, function(branch){
    if(branch[0] !== 'atruler'){
      return true;
    }

    var flatBranch = _.flatten(branch);
    var count = 0;

    for(var i = 0; i < flatBranch.length; i++){
      if(flatBranch[i] === 'property'){
        count++;
      }
    }

    return count > 0;
  });
};


var DEFAULT_OPTIONS = {
  write: false,
  minify: false,
  info: false
};
////////////////////
// ARGUMENTS
// files    = an array of filepaths to html/js files OR a raw string of content to search through
// css      = an array of filepaths to css files OR a raw string of css to filter
// options  = {
//   write  : string (filepath to write purified css to. if false, function returns raw string)
//   minify : boolean (if true, will minify the purified css)
//   info   : boolean (if true, will log out stats of how much css was reduced)
// }
////////////////////
var purify = function(files, css, options, callback){
  if(typeof options === 'function'){
    callback = options;
    options = {};
  }

  if(options){
    options = _.extend({}, DEFAULT_OPTIONS, options);
  } else {
    options = DEFAULT_OPTIONS;
  }

  var cssString = Array.isArray(css) ? concatFiles(css) : css;
  var content = Array.isArray(files) ? concatFiles(files) : files;
  content = content.toLowerCase();
  // Store starting length. Will be helpful later to show how much was reduced
  var beginningLength = cssString.length;

  // Turn css into abstract syntax tree
  var original = gonzales.srcToCSSP(cssString);

  // Tree with everything that begins with @ in css (@media, @keyframe, etc.)
  var atSign = _.filter(original, function(branch){
    return branch[0] === 'atruler' || branch[0] === 's';
  });

  // Tree with everything that doesn't start with an @ (classes, elements, ids, etc.)
  original = _.filter(original, function(branch){
    return branch[0] !== 'atruler';
  });

  // console.log(util.inspect(atSign, false, null));

  var flattenedCSS = _.flatten(original.slice());

  // Get list of things that are actually used
  var classes = extractClassesFromFlatCSS(flattenedCSS);
  var ids = extractIDsFromFlatCSS(flattenedCSS);
  var htmlEls = extractHTMLElementsFromContent(content);
  
  // Narrow tree down to stuff that is used
  classes = findClassesInFiles(classes, content);
  var stylesheet = filterByUsedClassesAndHtmlEls(original, classes, htmlEls);
  ids = filterByUsedIds(original, ids);
  removeUnusedMedias(atSign, classes);
  atSign = filterMediasByZeroClasses(atSign);

  // Turn tree back into css
  var idStyles = gonzales.csspToSrc(ids);
  var classStyles = gonzales.csspToSrc(stylesheet);
  var atStyles = gonzales.csspToSrc(atSign);

  // Combine and format
  var styles = classStyles + '\n' + atStyles + '\n' + idStyles;
  styles = JSON.parse(formatCSS(JSON.stringify(styles)));

  if(options.minify){
    styles = new CleanCss().minify(styles).styles;
  }

  if(options.info){
    console.log('##################################');
    console.log('Before purify, CSS was ' + beginningLength + ' chars long.');
    console.log('After purify, CSS is ' + styles.length + ' chars long. (' +
      Math.floor((beginningLength / styles.length * 10)) / 10  + ' times smaller)');
    console.log('##################################');
  }

  if(!options.output){
    if(callback){
      callback(styles);
    } else {
      return styles
    }
  } else {
    fs.writeFile(options.output, styles, function(err){
      if(err) return err;
    });
  }
};

module.exports = purify;
