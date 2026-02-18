git checkout --orphan temp_branch
git add .
git commit -m "Clean launch for PLIER without heavy assets"
git branch -D main
git branch -m main
git push -f origin main
