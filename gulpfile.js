'use strict';

var gulp     = require('gulp'),
	jshint   = require('gulp-jshint'),
	jsonlint = require('gulp-jsonlint');

var watchFiles = {
	jsFiles: ['./*.js'],
	jsonFiles: ['./*.json']
};

gulp.task('jshint', function () {
	return gulp.src(watchFiles.jsFiles)
		.pipe(jshint())
		.pipe(jshint.reporter('default', {verbose: true}))
		.pipe(jshint.reporter('fail'));
});

gulp.task('jsonlint', function () {
	return gulp.src(watchFiles.jsonFiles)
		.pipe(jsonlint())
		.pipe(jsonlint.reporter());
});

gulp.task('lint', ['jshint', 'jsonlint']);

gulp.task('test', ['lint']);
