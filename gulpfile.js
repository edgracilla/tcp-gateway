'use strict';

var gulp       = require('gulp'),
	plumber    = require('gulp-plumber'),
	jshint     = require('gulp-jshint'),
	jsonlint   = require('gulp-jsonlint');

var paths = {
	js: ['*.js', '*/*.js', '*/**/*.js', '!node_modules/**'],
	json: ['*.json', '*/*.json', '*/**/*.json', '!node_modules/**']
};

gulp.task('jslint', function () {
	return gulp.src(paths.js)
		.pipe(plumber())
		.pipe(jshint())
		.pipe(jshint.reporter('default'))
		.pipe(jshint.reporter('fail'));
});

gulp.task('jsonlint', function () {
	return gulp.src(paths.json)
		.pipe(plumber())
		.pipe(jsonlint())
		.pipe(jsonlint.reporter())
		.pipe(jsonlint.failOnError());
});

gulp.task('lint', ['jslint', 'jsonlint']);
gulp.task('test', ['lint']);